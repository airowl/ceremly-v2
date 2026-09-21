/**
 * Site mode autorevole lato SERVER.
 *
 * Authority condivisa fra TUTTI i gate server (middleware 0.site-mode + catch-all
 * auth): se ogni branch leggesse `config.public.siteMode` per conto proprio, un
 * toggle a runtime ne aggiornerebbe alcuni e non altri → stato incoerente.
 *
 * Precedenza: override runtime (Upstash Redis) → valore d'ambiente → "active".
 *
 * Serverless: ogni lambda mantiene una cache in-process con TTL breve. Dopo un
 * cambio via endpoint admin, le istanze già calde convergono entro il TTL — è un
 * kill-switch best-effort, NON una transizione atomica/istantanea.
 *
 * Resilienza: se Redis è irraggiungibile si ricade sul valore d'ambiente, mai su
 * "active" — un guasto di rete non deve togliere silenziosamente la maintenance.
 */
import { resolveSiteMode, type SiteMode } from "~~/shared/constants/siteMode";
import { cacheClient } from "./drivers";
import { runtimeConfig } from "./runtimeConfig";

/** Chiave Redis dell'override runtime. */
export const SITE_MODE_OVERRIDE_KEY = "site:mode";

/** TTL della cache per-istanza (ms). Breve: propagazione del toggle entro questo limite. */
const CACHE_TTL_MS = 10_000;

/**
 * Timeout della lettura autorevole da Convex (Task 12, Step 4).
 *
 * Corto: questa lettura sta sul percorso di **ogni** richiesta, e un gate che
 * aspetta un backend lento è un gate che rallenta il sito che dovrebbe proteggere.
 * 800ms è sopra il tempo di una query Convex su una riga sola e sotto il punto in
 * cui un utente percepisce l'attesa.
 */
export const SITE_MODE_TIMEOUT_MS = 800;

/** Le modalità che *chiudono* qualcosa: sono quelle che il guasto non deve riaprire. */
const CLOSED_MODES: readonly SiteMode[] = ["waitinglist", "maintenance", "maintenance-readonly"];

let cached: { mode: SiteMode; at: number } | undefined;

/**
 * Ultima modalità **osservata con successo** da Convex.
 *
 * È la memoria che rende il fail-closed possibile: senza, un guasto lascerebbe
 * l'istanza con la sola env e una maintenance in corso tornerebbe attiva da sola.
 * Deliberatamente non è la `cached` sopra, che scade: questa non scade mai.
 */
let lastObserved: SiteMode | undefined;

/** Valore d'ambiente normalizzato (default site mode quando non c'è override). */
function envSiteMode(): SiteMode {
    const config = useRuntimeConfig();
    return resolveSiteMode(config.public.siteMode);
}

/**
 * Lettura autorevole da Convex, con timeout.
 *
 * La rotta è pubblica e non firmata (il valore decide se il sito è aperto, e il
 * browser lo legge già): quello che protegge non è la firma, è cosa fa il Worker
 * quando la lettura **non** riesce.
 */
async function readConvexSiteMode(): Promise<SiteMode | null> {
    const siteUrl = String(runtimeConfig.public.convexSiteUrl ?? "").replace(/\/+$/, "");
    if (!siteUrl) return null;

    try {
        const response = await fetch(`${siteUrl}/public/site-mode`, {
            method: "GET",
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(SITE_MODE_TIMEOUT_MS),
        });
        if (!response.ok) return null;

        const body = (await response.json()) as { mode?: unknown };
        return resolveSiteMode(body.mode);
    } catch {
        // Timeout, DNS, JSON invalido: nessuna modalità, e il chiamante decide.
        return null;
    }
}

/**
 * Modalità sito autorevole per il server.
 *
 * Due sorgenti, scelte dal flag `siteModeBackend`:
 *
 * - `legacy` (default): override Upstash → env → "active".
 * - `convex`: tabella `siteSettings`, letta con timeout **fail-closed**.
 *
 * Fail-closed significa una regola sola, e vale la pena scriverla perché è quella
 * che il test pinna: se la lettura non riesce si conserva l'ultima modalità
 * **osservata** quando era una modalità chiusa, e non si ricade mai su `active`. Un
 * guasto di Convex non deve riaprire le scritture che un superAdmin ha chiuso — né
 * togliere la maintenance, né riaprire una waiting list.
 *
 * Il buco residuo, dichiarato: un'istanza **fredda** che non ha mai letto con
 * successo non può sapere cosa c'era, e ricade sull'env. Coprirlo richiederebbe di
 * trattare "sconosciuto" come chiuso, cioè di mandare il sito in maintenance a ogni
 * hiccup di Convex al primo request di ogni istanza nuova — un rimedio peggiore del
 * problema, per un caso in cui la env non può essere più permissiva di quanto
 * l'operatore abbia configurato.
 */
export async function getServerSiteMode(): Promise<SiteMode> {
    const now = Date.now();
    if (cached && now - cached.at < CACHE_TTL_MS) {
        return cached.mode;
    }

    const mode =
        runtimeConfig.siteModeBackend === "convex" ? await convexSiteMode() : await legacySiteMode();

    cached = { mode, at: now };
    return mode;
}

/** Sorgente legacy: override Upstash → env. */
async function legacySiteMode(): Promise<SiteMode> {
    let mode = envSiteMode();
    try {
        const override = await cacheClient.get(SITE_MODE_OVERRIDE_KEY);
        if (override) {
            mode = resolveSiteMode(override);
        }
    } catch {
        // Redis down → resta il valore d'ambiente (nessun un-maintenance silenzioso).
    }
    return mode;
}

/**
 * La regola fail-closed, isolata in una funzione pura.
 *
 * Pura perché è la parte che va verificata in tutti i casi, non solo in quelli che
 * una lettura di rete riesce a produrre: quattro modalità osservate × l'env. Se
 * vivesse dentro il ramo di errore, l'unico test possibile sarebbe
 * un'integrazione che sceglie un caso.
 */
export function resolveUnreachableSiteMode(input: {
    lastObserved: SiteMode | undefined;
    envDefault: SiteMode;
}): SiteMode {
    const { lastObserved, envDefault } = input;
    if (lastObserved !== undefined && CLOSED_MODES.includes(lastObserved)) {
        return lastObserved;
    }
    return envDefault;
}

/** Sorgente Convex: lettura con timeout, poi la regola fail-closed. */
async function convexSiteMode(): Promise<SiteMode> {
    const observed = await readConvexSiteMode();
    if (observed !== null) {
        lastObserved = observed;
        return observed;
    }

    return resolveUnreachableSiteMode({ lastObserved, envDefault: envSiteMode() });
}

/** Imposta l'override runtime e invalida la cache locale di questa istanza. */
export async function setServerSiteMode(mode: SiteMode): Promise<void> {
    await cacheClient.set(SITE_MODE_OVERRIDE_KEY, mode, undefined);
    cached = undefined;
}

/** Rimuove l'override runtime: il server torna a seguire il valore d'ambiente. */
export async function clearServerSiteModeOverride(): Promise<void> {
    await cacheClient.delete(SITE_MODE_OVERRIDE_KEY);
    cached = undefined;
}

/** Stato diagnostico per l'endpoint admin: override grezzo + default d'ambiente. */
export async function getSiteModeStatus(): Promise<{
    effective: SiteMode;
    override: SiteMode | null;
    envDefault: SiteMode;
}> {
    const envDefault = envSiteMode();
    let override: SiteMode | null = null;
    try {
        const raw = await cacheClient.get(SITE_MODE_OVERRIDE_KEY);
        override = raw ? resolveSiteMode(raw) : null;
    } catch {
        override = null;
    }
    return {
        effective: override ?? envDefault,
        override,
        envDefault,
    };
}
