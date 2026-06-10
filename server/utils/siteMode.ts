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

/** Chiave Redis dell'override runtime. */
export const SITE_MODE_OVERRIDE_KEY = "site:mode";

/** TTL della cache per-istanza (ms). Breve: propagazione del toggle entro questo limite. */
const CACHE_TTL_MS = 10_000;

let cached: { mode: SiteMode; at: number } | undefined;

/** Valore d'ambiente normalizzato (default site mode quando non c'è override). */
function envSiteMode(): SiteMode {
    const config = useRuntimeConfig();
    return resolveSiteMode(config.public.siteMode);
}

/**
 * Modalità sito autorevole per il server. Redis override → env → "active".
 * Memoizzata per ~CACHE_TTL_MS per non aggiungere un round-trip Redis a ogni request.
 */
export async function getServerSiteMode(): Promise<SiteMode> {
    const now = Date.now();
    if (cached && now - cached.at < CACHE_TTL_MS) {
        return cached.mode;
    }

    let mode = envSiteMode();
    try {
        const override = await cacheClient.get(SITE_MODE_OVERRIDE_KEY);
        if (override) {
            mode = resolveSiteMode(override);
        }
    } catch {
        // Redis down → resta il valore d'ambiente (nessun un-maintenance silenzioso).
    }

    cached = { mode, at: now };
    return mode;
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
