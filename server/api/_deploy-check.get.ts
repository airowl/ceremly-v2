//
// ⚠️ TEMPORANEO — verifica della risoluzione di VERCEL_ENV per il billing Creem.
// Conferma che `isProdDeployment` (che pilota Creem testMode) sia true SOLO sul
// deploy Production. RIMUOVERE questo file dopo aver completato la verifica.
//
// Uso: aprire   https://<dominio>/api/_deploy-check?token=vEnv-check-7Kq2
//   - dev.ceremly.com (Preview)  → atteso: vercelEnv "preview",    isProdDeployment false, creemTestMode true
//   - ceremly.com   (Production) → atteso: vercelEnv "production", isProdDeployment true,  creemTestMode false
// Se vercelEnv è null → "Automatically expose System Environment Variables" è OFF su Vercel.
//
import { runtimeConfig } from "~~/server/utils/runtimeConfig";

export default defineEventHandler((event) => {
    // Gate minimale: senza il token corretto l'endpoint "non esiste".
    if (getQuery(event).token !== "vEnv-check-7Kq2") {
        throw createError({ statusCode: 404, statusMessage: "Not Found" });
    }

    const isProdDeployment = runtimeConfig.public.isProdDeployment;

    return {
        // process.env letto QUI, a runtime nell'handler: dice se Vercel espone VERCEL_ENV.
        vercelEnv_runtime: process.env.VERCEL_ENV ?? null,
        nodeEnv: process.env.NODE_ENV ?? null,
        // valore effettivamente usato dal billing Creem (testMode = !isProdDeployment).
        isProdDeployment_billing: isProdDeployment,
        creemTestMode: !isProdDeployment,
    };
});
