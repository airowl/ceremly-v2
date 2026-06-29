/**
 * OG image generator for the public Ceremly website.
 *
 * Faithfully replicates the "Soft Meadow" design system (app/assets/css/ceremly.css):
 * cream canvas, camel/sage accents, envelope+check badge, Bricolage Grotesque font
 * (display) / Be Vietnam Pro (body) / Space Mono (tag) — the same fonts the site
 * loads via @nuxt/fonts. No generic template: each page has a title, tag and
 * tint consistent with its own category, so the social preview is "native".
 *
 * Texts (curated short title + SEO description) are pulled from i18n for IT and EN.
 * Output: public/og/<slug>-<locale>.png (1200x630).
 *
 * Usage:
 *   node scripts/generate-og.mjs            # all routes, IT + EN
 *   node scripts/generate-og.mjs pricing    # only the passed slugs (sample)
 *
 * Requires: playwright (chromium). See README at the bottom.
 */
import { chromium } from 'playwright'
import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT = resolve(ROOT, 'public/og')

const LOCALES = {
    it: JSON.parse(readFileSync(resolve(ROOT, 'i18n/locales/it-IT.json'), 'utf8')),
    en: JSON.parse(readFileSync(resolve(ROOT, 'i18n/locales/en-US.json'), 'utf8')),
}
const get = (obj, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), obj)

const W = 1200
const H = 630

// ── Themes by category (Soft Meadow palette) ──────────────────────────────
// bg: warm canvas gradient · c1/c2: decorative circles · accent: tag + footer
const THEMES = {
    prodotto: { tag: { it: 'Prodotto', en: 'Product' }, bg: 'linear-gradient(135deg,#fffdf7 0%,#fefae0 52%,#faedcd 100%)', c1: '#f6e7c8', c2: '#efddb9', accent: '#c28c54' },
    perchi: { tag: null, bg: 'linear-gradient(135deg,#fffdf7 0%,#fefae0 46%,#e9edc9 100%)', c1: '#e2e9c4', c2: '#d6e0b6', accent: '#6e8b2f' },
    risorse: { tag: { it: 'Risorse', en: 'Resources' }, bg: 'linear-gradient(135deg,#ffffff 0%,#fefae0 58%,#f4ead4 100%)', c1: '#f6e7c8', c2: '#ece0c5', accent: '#c28c54' },
    ceremly: { tag: { it: 'Ceremly', en: 'Ceremly' }, bg: 'linear-gradient(135deg,#fefae0 0%,#faedcd 58%,#ecdcbd 100%)', c1: '#f0e2c2', c2: '#e6d3b0', accent: '#6E4A1F' },
    // Home: hero without tag · Blog: sage tint with BLOG badge (dedicated output paths, see route.out)
    home: { tag: null, bg: 'linear-gradient(135deg,#fffdf7 0%,#fefae0 50%,#f6e8cb 100%)', c1: '#f4e3c2', c2: '#ecdab4', accent: '#c28c54' },
    blog: { tag: { it: 'Blog', en: 'Blog' }, bg: 'linear-gradient(135deg,#fffdf7 0%,#fbf6e4 48%,#e9edc9 100%)', c1: '#e2e9c4', c2: '#d6e0b6', accent: '#6e8b2f' },
}

// Thematic icons (SVG paths from app/components/ceremly/CerIcon.vue, viewBox 24)
const ICONS = {
    ring: ['M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10z', 'M7 9l-3-4 4-3 4 3', 'M17 9l3-4-4-3-4 3'],
    cap: ['M2 9l10-5 10 5-10 5L2 9z', 'M6 10.6V16a2 2 0 0 0 1 1.7c1.5 1 3.3 1.5 5 1.5s3.5-.5 5-1.5a2 2 0 0 0 1-1.7v-5.4', 'M21 9v7'],
    cake: ['M4 21V12a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9', 'M4 16h16', 'M9 10V7', 'M12 10V6', 'M15 10V7', 'M2 21h20'],
    cross: ['M12 3v18', 'M8 7h8'],
    sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z'],
}

// ── Route → OG content ──────────────────────────────────────────────────
// title: curated short title (the badge already says "Ceremly"). desc: i18n key
// of the SEO description (already polished text). tag/icon: override for use-cases.
const ROUTES = [
    // Product
    { slug: 'how-it-works', cat: 'prodotto', title: { it: 'Come funziona', en: 'How it works' }, desc: 'ceremly.site.comeFunziona.seoDescription' },
    { slug: 'features', cat: 'prodotto', title: { it: 'Funzionalità', en: 'Features' }, desc: 'ceremly.site.funzionalita.seoDescription' },
    { slug: 'templates', cat: 'prodotto', title: { it: 'Modelli di invito', en: 'Invitation templates' }, desc: 'ceremly.site.modelli.seoDescription' },
    { slug: 'pricing', cat: 'prodotto', title: { it: 'Prezzi', en: 'Pricing' }, desc: 'ceremly.site.prezzi.seoDescription' },
    { slug: 'examples', cat: 'prodotto', title: { it: 'Esempi di invito', en: 'Invitation examples' }, desc: 'ceremly.site.esempi.seoDescription' },
    // For whom (use-case) — tag = event type, dedicated icon, sage tint
    { slug: 'weddings', cat: 'perchi', title: { it: 'Matrimoni', en: 'Weddings' }, desc: 'ceremly.site.usecases.matrimoni.seoDescription', tag: { it: 'Matrimoni', en: 'Weddings' }, icon: 'ring' },
    { slug: 'graduations', cat: 'perchi', title: { it: 'Lauree', en: 'Graduations' }, desc: 'ceremly.site.usecases.lauree.seoDescription', tag: { it: 'Lauree', en: 'Graduations' }, icon: 'cap' },
    { slug: 'birthdays', cat: 'perchi', title: { it: 'Compleanni', en: 'Birthdays' }, desc: 'ceremly.site.usecases.compleanni.seoDescription', tag: { it: 'Compleanni', en: 'Birthdays' }, icon: 'cake' },
    { slug: 'baptisms', cat: 'perchi', title: { it: 'Battesimi', en: 'Christenings' }, desc: 'ceremly.site.usecases.battesimi.seoDescription', tag: { it: 'Battesimi', en: 'Christenings' }, icon: 'cross' },
    { slug: 'wedding-planner', cat: 'perchi', title: { it: 'Per wedding planner', en: 'For wedding planners' }, desc: 'ceremly.site.usecases.planner.seoDescription', tag: { it: 'Wedding planner', en: 'Wedding planners' }, icon: 'sparkle' },
    // Resources
    { slug: 'rsvp-guide', cat: 'risorse', title: { it: 'Guida RSVP', en: 'RSVP guide' }, desc: 'ceremly.site.guidaRsvp.seoDescription' },
    { slug: 'help-center', cat: 'risorse', title: { it: 'Centro aiuto', en: 'Help center' }, desc: 'ceremly.site.centroAiuto.seoDescription' },
    { slug: 'status', cat: 'risorse', title: { it: 'Stato del servizio', en: 'Service status' }, desc: 'ceremly.site.stato.seoDescription' },
    { slug: 'changelog', cat: 'risorse', title: { it: 'Changelog', en: 'Changelog' }, desc: 'ceremly.site.changelog.seoDescription' },
    { slug: 'api', cat: 'risorse', title: { it: 'API per partner', en: 'Partner API' }, desc: 'ceremly.site.api.seoDescription' },
    // Ceremly brand
    { slug: 'about', cat: 'ceremly', title: { it: 'Chi siamo', en: 'About us' }, desc: 'ceremly.site.chiSiamo.seoDescription' },
    { slug: 'contact', cat: 'ceremly', title: { it: 'Contatti', en: 'Contact' }, desc: 'landing.contact.description' },
    // Home + Blog: overwrite existing assets (dedicated output paths) → no changes to app.vue/blog pages.
    // NB: landing.seo.* and blog.seo.* still contain boilerplate text, so we use ceremly.home.seo / curated text.
    { slug: 'home', cat: 'home', out: (loc) => `ogImage-${loc}`, title: { it: 'Inviti digitali e RSVP intelligenti', en: 'Digital invitations and smart RSVPs' }, desc: 'ceremly.home.seo.description' },
    { slug: 'blog', cat: 'blog', out: (loc) => `og/blog-${loc}`, title: { it: 'Guide e Consigli', en: 'Guides and Tips' }, descText: { it: 'Articoli pratici per organizzare eventi indimenticabili e gestire le conferme senza stress.', en: 'Practical articles to organize unforgettable events and manage RSVPs without stress.' } },
]

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Title font-size based on length (short words → huge title)
const titleSize = (s) => {
    const n = s.length
    if (n <= 10) return 86
    if (n <= 16) return 76
    if (n <= 24) return 64
    return 54
}

// Clamp the description to ~115 chars at a word boundary (2 clean lines)
const clampDesc = (s) => {
    if (s.length <= 118) return s
    const cut = s.slice(0, 115)
    return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '…'
}

const iconSvg = (name, color, size = 26) => {
    const paths = (ICONS[name] || []).map((d) => `<path d="${d}" />`).join('')
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
}

// Envelope+check badge (the visual identity of Ceremly OG images), camel gradient
const brandMark = () => `
  <div style="width:60px;height:60px;border-radius:15px;background:linear-gradient(150deg,#dcae7d 0%,#c28c54 100%);box-shadow:0 6px 18px rgba(94,68,38,0.22);display:flex;align-items:center;justify-content:center;">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fffaf0" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3.5 7l8.5 6 8.5-6" />
      <path d="M8.5 12.5l2.2 2.2 4.3-4.3" />
    </svg>
  </div>`

const globe = (color) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/></svg>`

function buildHtml(route, locale) {
    const th = THEMES[route.cat]
    const title = route.title[locale]
    const descRaw = route.descText ? route.descText[locale] : (get(LOCALES[locale], route.desc) || '')
    const desc = clampDesc(descRaw)
    const fs = titleSize(title)

    const tagLabel = route.tag ? route.tag[locale] : (th.tag ? th.tag[locale] : '')
    const tag = (route.notag || !tagLabel) ? '' : `
    <div style="display:inline-flex;align-items:center;gap:8px;font-family:'Space Mono',monospace;font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${th.accent};background:rgba(255,255,255,0.62);border:1px solid rgba(63,54,34,0.14);padding:7px 14px;border-radius:6px;">
      ${route.icon ? iconSvg(route.icon, th.accent, 18) : ''}${esc(tagLabel)}
    </div>`

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Be+Vietnam+Pro:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{width:${W}px;height:${H}px;overflow:hidden;}
    .card{position:relative;width:${W}px;height:${H}px;background:${th.bg};overflow:hidden;
      font-family:'Be Vietnam Pro',system-ui,sans-serif;color:#3F3622;
      padding:74px 80px;display:flex;flex-direction:column;justify-content:space-between;
      -webkit-font-smoothing:antialiased;}
    .circle{position:absolute;border-radius:50%;}
    .top{display:flex;align-items:center;gap:14px;position:relative;z-index:2;}
    .brand{font-family:'Bricolage Grotesque',sans-serif;font-size:30px;font-weight:800;letter-spacing:-0.03em;color:#3F3622;}
    .dot{width:8px;height:8px;border-radius:50%;background:#d4a373;display:inline-block;margin-left:-4px;margin-bottom:-12px;}
    .mid{position:relative;z-index:2;display:flex;flex-direction:column;align-items:flex-start;gap:22px;max-width:940px;}
    .title{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;letter-spacing:-0.025em;line-height:1.02;color:#3F3622;font-size:${fs}px;}
    .desc{font-size:27px;line-height:1.42;color:#786949;max-width:780px;font-weight:400;}
    .foot{display:flex;align-items:center;gap:9px;position:relative;z-index:2;font-size:22px;font-weight:600;color:${th.accent};}
  </style></head>
  <body>
    <div class="card">
      <div class="circle" style="width:380px;height:380px;background:${th.c1};top:-150px;right:-90px;opacity:0.55;"></div>
      <div class="circle" style="width:240px;height:240px;border:2px solid ${th.c2};bottom:-90px;left:-70px;opacity:0.6;"></div>
      <div class="circle" style="width:120px;height:120px;background:${th.c2};bottom:60px;right:120px;opacity:0.35;"></div>

      <div class="top">${brandMark()}<span class="brand">Ceremly</span><span class="dot"></span></div>

      <div class="mid">
        ${tag}
        <div class="title">${esc(title)}</div>
        <div class="desc">${esc(desc)}</div>
      </div>

      <div class="foot">${globe(th.accent)}<span>ceremly.com</span></div>
    </div>
  </body></html>`
}

async function main() {
    const only = process.argv.slice(2)
    const routes = only.length ? ROUTES.filter((r) => only.includes(r.slug)) : ROUTES
    if (!routes.length) {
        console.error('No route matches:', only.join(', '))
        process.exit(1)
    }
    mkdirSync(OUT, { recursive: true })

    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })

    let n = 0
    for (const route of routes) {
        for (const locale of ['it', 'en']) {
            const html = buildHtml(route, locale)
            await page.setContent(html, { waitUntil: 'networkidle' })
            await page.evaluate(() => document.fonts.ready)
            await page.waitForTimeout(250)
            const rel = route.out ? route.out(locale) : `og/${route.slug}-${locale}`
            const file = resolve(ROOT, 'public', `${rel}.png`)
            mkdirSync(dirname(file), { recursive: true })
            const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } })
            // Quantized PNG (palette + dithering) to stay under ~150KB without visible banding
            await sharp(buf).png({ compressionLevel: 9, palette: true, quality: 90, dither: 1, effort: 10 }).toFile(file)
            n++
            console.log(`✓ ${route.slug}-${locale}.png  [${route.cat}]`)
        }
    }
    await browser.close()
    console.log(`\nGenerated ${n} images in public/og/`)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
