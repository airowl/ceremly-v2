// https://nuxt.com/docs/api/configuration/nuxt-config
import { defineNuxtConfig } from "nuxt/config";
import { generateRuntimeConfig } from "./server/utils/runtimeConfig";

export default defineNuxtConfig({
    app: {
        head: {
            script: [
                {
                    src: 'https://datafa.st/js/script.js',
                    defer: true,
                    'data-website-id': 'dfid_QH5EiOhjJIj12ptsEinDZ',
                    'data-domain': 'ceremly.com',
                },
            ],
        },
    },

    modules: [
        "@nuxt/ui",
        "@vueuse/nuxt",
        "@nuxt/image",
        "@nuxtjs/i18n",
        "@nuxtjs/seo",
        "@nuxt/content",
        "nuxt-security",
        "@nuxt/fonts",
        "@pinia/nuxt",
    ],

    components: true, // Abilita auto-import componenti

    devtools: {
        enabled: true,
    },

    css: ["~/assets/css/main.css"],

    routeRules: {
        "/**": {
            headers: {
                "X-Frame-Options": "DENY",
                "X-Content-Type-Options": "nosniff",
                "X-XSS-Protection": "1; mode=block",
                "Strict-Transport-Security":
                    "max-age=31536000; includeSubDomains",
                "Referrer-Policy": "strict-origin-when-cross-origin",
                "Permissions-Policy":
                    "geolocation=(), microphone=(), camera=()",
                "X-Powered-By": "PHP/5.2.17", // Finto! Confonde i bot
                Server: "Apache/2.2.15", // Finto! Li manda su path sbagliati
            },
        },
        "/wp-admin/**": { redirect: "/" },
        "/wp-login.php": { redirect: "/" },
        "/wordpress/**": { redirect: "/" },
        "/xmlrpc.php": { redirect: "/" },

        // Blocca file sensibili
        "/.env": { redirect: "/" },
        "/.git/**": { redirect: "/" },
        "/cmd_sco": { redirect: "/" },

        // Nuxt Icon internal proxy - exempt from security
        "/api/_nuxt_icon/**": {
            security: {
                rateLimiter: false,
                xssValidator: false,
                corsHandler: false,
                requestSizeLimiter: false,
            },
        },

        // Cache assets (GRATIS - riduce carico)
        "/_nuxt/**": {
            headers: { "Cache-Control": "public, max-age=31536000, immutable" },
        },
        "/api/**": {
            cors: true,
        },
        // 🚧 MANUTENZIONE - Redirect home alla pagina maintenance
        // "/": { redirect: "/maintenance" },
        // Landing page con SSR/SSG
        "/": { prerender: true },
        "/en": { prerender: true }, // English landing page
        "/maintenance": { prerender: true },
        // "/pricing": { prerender: true }, // Page not yet created

        // Dashboard & Events management - client-side only
        "/dashboard/**": { ssr: false, prerender: false },

        "/login": { ssr: false, prerender: false },
        "/signup": { ssr: false, prerender: false },
        "/invite/**": { ssr: false, prerender: false },

        // Blog pages - SSR enabled for SEO
        "/blogs/**": { ssr: true },
        "/en/blogs/**": { ssr: true },

        // Public pages - SSR enabled for SEO, no auth required
        "/*/p/*": {
            ssr: true,
            security: {
                rateLimiter: false,
            },
        },

        // Disable security for Creem webhook - has its own signature verification
        "/api/auth/creem/**": {
            security: {
                corsHandler: false,
                xssValidator: false,
                rateLimiter: false,
            },
        },

        // QStash job consumers — own HMAC signature verification.
        // xssValidator MUST be off: it mutates the POST body and would
        // invalidate the QStash signature (computed over the raw body).
        "/api/jobs/**": {
            security: {
                corsHandler: false,
                xssValidator: false,
                rateLimiter: false,
            },
        },

        // Vercel Cron endpoints — authorized by CRON_SECRET (GET).
        "/api/cron/**": {
            security: {
                rateLimiter: false,
            },
        },

    },

    i18n: {
        defaultLocale: "it",
        lazy: true,
        locales: [
            { code: "en", iso: "en-US", file: "en-US.json", name: "EN" },
            { code: "it", iso: "it-IT", file: "it-IT.json", name: "IT" },
        ],
        langDir: "locales/",
        strategy: "prefix_except_default",
        detectBrowserLanguage: {
            useCookie: true,
            cookieKey: "i18n_redirected",
            redirectOn: "root", // Rileva solo sulla root
            alwaysRedirect: false, // Non forzare dopo la prima scelta
            fallbackLocale: "it",
        },
    },

    site: {
        url: process.env.NUXT_PUBLIC_BASE_URL || "https://ceremly.it",
        name: "Ceremly",
        description: "Piattaforma automatica per gestire gli RSVP di eventi privati via Email e WhatsApp.",
        defaultLocale: "it",
    },

    sitemap: {
        // Auto-discover routes from pages/ directory
        // Exclude dashboard, auth, and admin routes
        exclude: [
            "/dashboard/**",
            "/login",
            "/signup",
            "/invite/**",
            "/maintenance",
            "/legal/**",
        ],
        // i18n integration: generates alternate hreflang entries
        autoI18n: true,
        defaults: {
            changefreq: "weekly",
            priority: 0.8,
        },
    },

    robots: {
        disallow: [
            "/api/",
            "/dashboard/",
            "/login",
            "/signup",
            "/invite/",
            "/_nuxt/",
            "/.env",
            "/wp-admin/",
            "/wordpress/",
        ],
        allow: ["/", "/en/"],
        groups: [
            { userAgent: ["sqlmap"], disallow: ["/"] },
            { userAgent: ["nikto"], disallow: ["/"] },
            { userAgent: ["masscan"], disallow: ["/"] },
            { userAgent: ["nmap"], disallow: ["/"] },
        ],
    },

    ogImage: { enabled: false },

    linkChecker: {
        enabled: process.env.NODE_ENV !== "production",
    },

    schemaOrg: {
        identity: {
            type: "Organization",
            name: "Ceremly",
            url: process.env.NUXT_PUBLIC_BASE_URL || "https://ceremly.it",
            logo: "/icon.png",
        },
    },

    security: {
        // ✅ Content Security Policy
        headers: {
            contentSecurityPolicy: {
                "default-src": ["'self'"],
                "script-src": [
                    "'self'",
                    "'unsafe-inline'",
                    "'wasm-unsafe-eval'",
                    "https://www.googletagmanager.com",
                    "https://datafa.st",
                ],
                "style-src": [
                    "'self'",
                    "'unsafe-inline'",
                    "https://fonts.googleapis.com",
                    "https://cdn.jsdelivr.net",
                    "https://cdnjs.cloudflare.com",
                ],
                "img-src": ["'self'", "data:", "blob:", "https://*.r2.dev", "https://lh3.googleusercontent.com"],
                "font-src": ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
                "connect-src": [
                    "'self'",
                    "https://*.r2.cloudflarestorage.com",
                    "https://api.iconify.design",
                    "https://datafa.st",
                    process.env.NUXT_PUBLIC_BASE_URL || "http://localhost:3000",
                ],
                "frame-src": ["'self'"],
                "object-src": ["'none'"],
            },

            // ✅ Anti-clickjacking
            xFrameOptions: "DENY",

            // ✅ XSS protection (legacy + modern)
            xXSSProtection: "1; mode=block",

            // ✅ Mimetypes strict
            xContentTypeOptions: "nosniff",

            // ✅ HSTS - forza HTTPS
            strictTransportSecurity: {
                maxAge: 63072000, // 2 anni
                includeSubdomains: true,
                preload: true,
            },

            // ✅ Referrer policy
            referrerPolicy: "strict-origin-when-cross-origin",

            // ✅ Permissions Policy (limita accesso a API browser)
            permissionsPolicy: {
                camera: [],
                microphone: [],
                geolocation: [],
                payment: [],
            },
        },

        // ✅ Proteggi dagli header malevoli
        requestSizeLimiter: {
            maxRequestSizeInBytes: 1_000_000, // 1MB
            maxUploadFileRequestInBytes: 5_000_000,
        },

        // ✅ Rate limiting (difesa brute-force / scraping)
        rateLimiter: {
            tokensPerInterval: 100,
            interval: "minute",
        },

        // ✅ Limitazione metodi HTTP
        allowedMethodsRestricter: {
            methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        },

        // ✅ CORS configurabile
        corsHandler: {
            origin: process.env.NODE_ENV === "development"
                ? ["http://localhost:3000"]
                : [process.env.NUXT_PUBLIC_BASE_URL || "https://example.com"],
            methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            preflight: {
                statusCode: 204,
            },
        },

        // ✅ Sanitizzazione automatica input (contro XSS e SQLi)
        xssValidator: {
            methods: ["POST", "PUT", "PATCH"],
        },

        // ✅ Rimozione header sensibili da risposte
        hidePoweredBy: true,
    },

    nitro: {
        preset: process.env.NUXT_NITRO_PRESET || "vercel",
        routeRules: {
            "/.env": { redirect: "/404" },
            "/.git": { redirect: "/404" },
            "/wp-*": { redirect: "/404" },
            "/config*": { redirect: "/404" },
        },
        // Vercel-specific Build Output API config. The authority for deploy
        // config is .vercel/output/config.json (merged from here) — NOT a
        // root vercel.json. Crons invoke /api/cron/* via HTTP GET.
        vercel: {
            config: {
                crons: [
                    {
                        path: "/api/cron/cleanup-files",
                        // Hobby plan = max 1 run/day. Pro = minute precision.
                        schedule: "0 3 * * *",
                    },
                ],
            },
            // Background jobs can be slow (export/variant). Raise limits.
            functionRules: {
                "/api/jobs/**": {
                    maxDuration: 300,
                    memory: 1024,
                },
            },
        },
    },

    vite: {
        server: {
            allowedHosts: [".trycloudflare.com"],
        },
        build: {
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (id.includes("node_modules/grapesjs")) return "vendor-grapesjs";
                        if (id.includes("node_modules/@unovis")) return "vendor-unovis";

                        if (id.includes("@iconify-json")) return "vendor-icons";
                    },
                },
            },
        },
    },

    runtimeConfig: generateRuntimeConfig(),

    icon: {
        // Bundle icons from local @iconify-json/* packages (no Iconify API calls)
        serverBundle: "local",
        clientBundle: {
            // Scan source files and bundle ONLY icons actually used
            scan: true,
        },
    },

    ui: {
        colorMode: false,
    },

    content: {
        build: {
            markdown: {
                highlight: {
                    theme: 'github-light',
                    langs: ['ts', 'js', 'vue', 'html', 'css', 'bash', 'json'],
                },
            },
        },
    },

    image: {
        quality: 80,
        format: ['webp', 'jpg'],
        screens: {
            xs: 320,
            sm: 640,
            md: 768,
            lg: 1024,
            xl: 1280,
            xxl: 1536,
        },
    },

    compatibilityDate: "2024-07-11",

    $production: {
        build: {
            transpile: ["zod"],
        },
    },
});
