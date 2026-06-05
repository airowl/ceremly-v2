# Nuxt Configuration

## Table of Contents
- [Overview](#overview)
- [Core Configuration](#core-configuration)
- [Modules](#modules)
- [Route Rules](#route-rules)
- [Security Headers](#security-headers)
- [Runtime Config](#runtime-config)
- [i18n Configuration](#i18n-configuration)

---

## Overview

YourSaaS's Nuxt configuration is in `fe/app/nuxt.config.ts`:

- **Framework**: Nuxt 4 with Vue 3
- **Styling**: Tailwind CSS via Nuxt UI
- **Security**: nuxt-security module
- **i18n**: @nuxtjs/i18n for internationalization

---

## Core Configuration

### Basic Setup

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
    // Enable Nuxt 4 features
    future: {
        compatibilityVersion: 4,
    },

    // TypeScript
    typescript: {
        strict: true,
        typeCheck: true,
    },

    // Dev tools
    devtools: { enabled: true },

    // SSR configuration
    ssr: true,

    // App metadata
    app: {
        head: {
            title: 'YourSaaS',
            meta: [
                { charset: 'utf-8' },
                { name: 'viewport', content: 'width=device-width, initial-scale=1' },
                { name: 'description', content: 'Event management platform' },
            ],
            link: [
                { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
            ],
        },
    },
});
```

---

## Modules

### Active Modules

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
    modules: [
        '@nuxt/ui',           // UI components + Tailwind
        '@pinia/nuxt',        // State management
        '@nuxtjs/i18n',       // Internationalization
        'nuxt-security',      // Security headers
        '@nuxthub/core',      // NuxtHub deployment
    ],
});
```

### Nuxt UI Configuration

```typescript
export default defineNuxtConfig({
    ui: {
        // Theme colors
        primary: 'indigo',
        gray: 'slate',
    },
});
```

### Pinia Configuration

```typescript
export default defineNuxtConfig({
    pinia: {
        autoImports: ['defineStore', 'storeToRefs'],
    },
});
```

---

## Route Rules

### SSR and Prerender Rules

```typescript
export default defineNuxtConfig({
    routeRules: {
        // Static landing pages (prerendered at build)
        '/': { prerender: true },
        '/en': { prerender: true },
        '/pricing': { prerender: true },
        '/features': { prerender: true },

        // Client-side only (no SSR)
        '/dashboard/**': { ssr: false },
        '/login': { ssr: false, prerender: false },
        '/signup': { ssr: false, prerender: false },
        '/forgot-password': { ssr: false, prerender: false },
        '/callback': { ssr: false, prerender: false },

        // API proxy (if needed)
        '/api/**': { cors: true },
    },
});
```

### When to Use Each Rule

| Rule | Use Case |
|------|----------|
| `prerender: true` | Static pages that don't change per-user |
| `ssr: false` | Pages requiring auth or heavy client interaction |
| `ssr: true` (default) | SEO-important pages with dynamic content |
| `cors: true` | API endpoints needing CORS |

---

## Security Headers

### nuxt-security Configuration

```typescript
export default defineNuxtConfig({
    security: {
        // Content Security Policy
        headers: {
            contentSecurityPolicy: {
                'default-src': ["'self'"],
                'script-src': [
                    "'self'",
                    "'unsafe-inline'",  // Required for Vue
                    'https://js.stripe.com',
                ],
                'style-src': [
                    "'self'",
                    "'unsafe-inline'",  // Required for Tailwind
                ],
                'img-src': [
                    "'self'",
                    'data:',
                    'https:',
                ],
                'font-src': [
                    "'self'",
                    'https://fonts.gstatic.com',
                ],
                'connect-src': [
                    "'self'",
                    process.env.NUXT_PUBLIC_SUPABASE_URL!,
                    'https://api.stripe.com',
                ],
                'frame-src': [
                    "'self'",
                    'https://js.stripe.com',
                ],
            },
            // HSTS
            strictTransportSecurity: {
                maxAge: 31536000,
                includeSubdomains: true,
                preload: true,
            },
            // Other headers
            xContentTypeOptions: 'nosniff',
            xFrameOptions: 'SAMEORIGIN',
            xXSSProtection: '1; mode=block',
            referrerPolicy: 'strict-origin-when-cross-origin',
        },

        // Rate limiting
        rateLimiter: {
            tokensPerInterval: 150,
            interval: 300000, // 5 minutes
            headers: true,
        },

        // Request size limit
        requestSizeLimiter: {
            maxRequestSizeInBytes: 2000000, // 2MB
            maxUploadFileRequestInBytes: 8000000, // 8MB
        },

        // CORS
        corsHandler: {
            origin: [process.env.NUXT_SITE_URL!],
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        },
    },
});
```

---

## Runtime Config

### Configuration

```typescript
export default defineNuxtConfig({
    runtimeConfig: {
        // Server-only (not exposed to client)
        secretKey: process.env.SECRET_KEY,

        // Public (exposed to client)
        public: {
            supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL,
            supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY,
            siteMode: process.env.NUXT_PUBLIC_SITE_MODE || 'active',
            nodeEnv: process.env.NUXT_PUBLIC_NODE_ENV || 'development',
            stripePublicKey: process.env.NUXT_PUBLIC_STRIPE_PUBLIC_KEY,
        },
    },
});
```

### Usage in Components

```typescript
<script setup lang="ts">
const config = useRuntimeConfig();

// Public config (available on client and server)
const supabaseUrl = config.public.supabaseUrl;
const siteMode = config.public.siteMode;

// Server-only config (only in server context)
// const secret = config.secretKey; // Error on client!
</script>
```

### Environment Variables

```bash
# .env
NUXT_SITE_URL=https://example.com
NUXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NUXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NUXT_PUBLIC_SITE_MODE=active
NUXT_PUBLIC_NODE_ENV=production
NUXT_PUBLIC_STRIPE_PUBLIC_KEY=pk_live_...
```

---

## i18n Configuration

### Basic Setup

```typescript
export default defineNuxtConfig({
    i18n: {
        locales: [
            {
                code: 'it',
                name: 'Italiano',
                file: 'it.json',
            },
            {
                code: 'en',
                name: 'English',
                file: 'en.json',
            },
        ],
        defaultLocale: 'it',
        langDir: 'locales/',
        strategy: 'prefix_except_default',
        lazy: true,
        detectBrowserLanguage: {
            useCookie: true,
            cookieKey: 'i18n_locale',
            redirectOn: 'root',
        },
    },
});
```

### Locale Files

```json
// locales/it.json
{
    "common": {
        "save": "Salva",
        "cancel": "Annulla",
        "delete": "Elimina",
        "edit": "Modifica"
    },
    "auth": {
        "login": "Accedi",
        "logout": "Esci",
        "signup": "Registrati"
    },
    "events": {
        "title": "Eventi",
        "create": "Crea evento",
        "noEvents": "Nessun evento"
    }
}
```

### Usage in Components

```vue
<script setup lang="ts">
const { t, locale } = useI18n();

function changeLocale(code: string) {
    locale.value = code;
}
</script>

<template>
    <h1>{{ t('events.title') }}</h1>
    <UButton>{{ t('events.create') }}</UButton>

    <!-- Language switcher -->
    <USelect
        :model-value="locale"
        :options="[
            { label: 'Italiano', value: 'it' },
            { label: 'English', value: 'en' },
        ]"
        @update:model-value="changeLocale"
    />
</template>
```

---

## NuxtHub Configuration

### Deployment Setup

```typescript
export default defineNuxtConfig({
    hub: {
        // Enable NuxtHub features
        database: false, // Using Supabase instead
        kv: false,
        blob: false,
        cache: true,
    },

    nitro: {
        preset: 'cloudflare-pages',
    },
});
```

---

## Build Configuration

### Memory and Performance

```typescript
export default defineNuxtConfig({
    // Increase Node memory for builds
    nitro: {
        experimental: {
            asyncContext: true,
        },
    },

    // Build optimization
    vite: {
        build: {
            chunkSizeWarningLimit: 1000,
        },
    },

    // Experimental features
    experimental: {
        payloadExtraction: false,
        renderJsonPayloads: true,
    },
});
```

### Build Command

```bash
# In package.json
{
    "scripts": {
        "build": "NODE_OPTIONS='--max-old-space-size=4096' nuxt build",
        "dev": "nuxt dev",
        "preview": "nuxt preview",
        "typecheck": "nuxt typecheck"
    }
}
```

---

## Quick Reference

### File Structure

```
fe/
├── app/
│   ├── nuxt.config.ts      # Main config
│   ├── app.config.ts       # App-level config (theming)
│   ├── tailwind.config.ts  # Tailwind config (if needed)
│   └── locales/            # i18n files
│       ├── it.json
│       └── en.json
├── .env                    # Environment variables
└── .env.example            # Environment template
```

### Environment Variables Checklist

```bash
# Required
NUXT_SITE_URL=
NUXT_PUBLIC_SUPABASE_URL=
NUXT_PUBLIC_SUPABASE_ANON_KEY=

# Optional
NUXT_PUBLIC_SITE_MODE=active
NUXT_PUBLIC_NODE_ENV=development
NUXT_PUBLIC_STRIPE_PUBLIC_KEY=
```
