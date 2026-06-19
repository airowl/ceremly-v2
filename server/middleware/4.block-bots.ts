// server/middleware/0.block-bots.ts
export default defineEventHandler((event) => {
    const path = event.path.toLowerCase();

    // Skip bot protection for admin API and auth webhooks (Creem)
    if (
        path.startsWith("/api/admin") ||
        path.startsWith("/api/auth/") ||
        path.startsWith("/api/jobs") ||
        path.startsWith("/api/cron") ||
        path.startsWith("/api/webhooks")
    ) {
        return;
    }

    // Lista blocco immediato
    const blockedPaths = [
        "wp-admin",
        "wp-login",
        "wp-includes",
        "wp-content",
        "wordpress",
        "xmlrpc",
        "wlwmanifest",
        "setup-config",
        ".env",
        ".git",
        "cmd_sco",
        "main.js",
        "/feed/",
        "license.txt",
        "core.js",
        "jquery.js",
    ];

    // Blocca IMMEDIATAMENTE
    for (const blocked of blockedPaths) {
        if (path.includes(blocked)) {
            // Log per debug (vedi nei log di NuxtHub)
            console.log(`[BLOCKED] Bot attempt: ${path}`);

            // Risposta immediata senza throw (più veloce)
            event.node.res.statusCode = 404;
            event.node.res.setHeader("Content-Type", "text/plain");
            event.node.res.end("Not Found");
            return; // Stop processing
        }
    }

    // Blocca user agent sospetti
    const userAgent = getHeader(event, "user-agent")?.toLowerCase() || "";
    const badBots = [
        "sqlmap",
        "nikto",
        "masscan",
        "nmap",
        "scanner",
        "zgrab",
        "python-requests", // Molti bot usano questo
        "curl", // Opzionale: blocca curl (ma attento, potrebbe bloccare tool legittimi)
        "wget",
    ];

    if (badBots.some((bot) => userAgent.includes(bot))) {
        console.log(`[BLOCKED] Bad bot UA: ${userAgent}`);
        event.node.res.statusCode = 403;
        event.node.res.setHeader("Content-Type", "text/plain");
        event.node.res.end("Forbidden");
        return;
    }
});
