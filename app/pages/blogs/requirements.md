## Blog System Requirements
<!-- Last updated: 2026-02-02 by Claude Code -->

### Current Implementation
- @nuxt/content v3 for markdown-based blog posts
- Blog listing page at `/blogs` with tag filtering and pagination
- Single article page at `/blogs/[slug]` with markdown rendering
- Featured article card on blog index
- Newsletter CTA connected to existing waiting list API
- Blog accessible in waitinglist mode (SEO/content marketing)
- Full i18n support (IT/EN)
- SEO meta tags + JSON-LD structured data (BlogPosting schema)
- Related articles by tag
- Multilingual blog content with locale-based filtering ✅ (Added 2026-02-02)
- Translation linking between IT/EN articles via `translationSlug` ✅ (Added 2026-02-02)
- Language switch banner on article pages ✅ (Added 2026-02-02)
- `hreflang` alternate links for translated articles ✅ (Added 2026-02-02)
- `localePath()` for all internal blog links ✅ (Added 2026-02-02)

### Architecture Notes
- Content collection: `blog` defined in `content.config.ts`
- Source: `content/blogs/*.md` with Zod schema validation
- Frontmatter: title, description, date, cover, coverAlt, tags[], author, authorAvatar, featured, published, locale, translationSlug
- Composable: `useBlog()` with reading time, date formatting, tag extraction
- Types: `BlogArticleMeta`, `BlogTag` in `shared/utils/blog.ts`
- Layout: uses `landing` layout for consistent header/footer
- Route rules: `/blogs/**` and `/en/blogs/**` with SSR enabled
- Middleware: `/blogs` and `/en/blogs` allowed in waitinglist mode

### Multilingual Content Architecture
- **Flat directory**: all articles in `content/blogs/*.md` (no nested locale dirs)
- **Locale field**: `locale: 'it' | 'en'` in frontmatter, defaults to `'it'`
- **Translation linking**: `translationSlug` shared between IT/EN versions of the same article
- **Client-side filtering**: articles fetched globally, filtered by `locale === currentLocale` in computed
- **Locale-specific tags**: Italian articles use Italian tags, English use English tags
- **`useLocalePath()`**: wraps all internal blog links for correct i18n prefix handling
- **Language switch**: banner on article pages links to translated version when available
- **SEO**: `hreflang` alternate links + `inLanguage` in JSON-LD structured data

### Components
| Component | Purpose |
|-----------|---------|
| `BlogArticleCard.vue` | Article card for grid display (uses `localePath`) |
| `BlogFeaturedCard.vue` | Large featured article card (uses `localePath`) |
| `BlogTagFilter.vue` | Sticky horizontal tag filter bar |
| `BlogNewsletter.vue` | Gradient CTA banner with email form |
| `BlogSidebar.vue` | Sidebar with newsletter CTA + category explorer (uses `localePath`) |

### Pages
| Route | File | Description |
|-------|------|-------------|
| `/blogs` | `app/pages/blogs/index.vue` | Blog listing with hero, filters, grid, pagination (locale-filtered) |
| `/blogs/[slug]` | `app/pages/blogs/[slug].vue` | Single article with prose rendering, sidebar, related, translation banner |

### Content
- 3 Italian articles + 3 English translations in `content/blogs/`
- Cover images rendered from frontmatter `cover` field with gradient fallback when missing
- Articles are filtered by `published: true` and `locale` fields

| Italian Article | English Translation | translationSlug |
|----------------|---------------------|-----------------|
| `gestione-rsvp-matrimonio.md` | `wedding-rsvp-management.md` | `rsvp-wedding-management` |
| `whatsapp-vs-email-inviti.md` | `whatsapp-vs-email-invitations.md` | `whatsapp-vs-email-invitations` |
| `errori-comuni-organizzazione-eventi.md` | `common-event-planning-mistakes.md` | `common-event-planning-mistakes` |

### Newsletter Integration
- Connected to `/api/waiting-list/subscribe` endpoint
- Honeypot + timing-based spam protection
- Source tracking: `blog-newsletter`, `blog-sidebar`, `footer-newsletter`
- Handles `alreadySubscribed` response

### Navigation Updates
- Header: `UNavigationMenu` enabled with Features, Pricing, Blog links
- Footer: Blog link added to Resources column in all site modes
- Landing page: Blog link in inline navbar and footer

### i18n Keys
- Top-level `blog` section in both `it-IT.json` and `en-US.json`
- Keys: `seo`, `hero`, `filter`, `featured`, `card`, `pagination`, `article`, `sidebar`, `newsletter`
- Translation keys: `blog.article.readInEnglish`, `blog.article.readInItalian`
- Empty state key: `blog.filter.noArticlesInLocale`
- `landing.nav.blog`, `landing.landingFooter.blog`, `footer.resources.blog` also added

### Dependencies
- `@nuxt/content` ^3.11.0

### Limitations / Future Improvements
- ~~Cover images are CSS gradients (no real images yet)~~ ✅ Cover images now render from frontmatter with gradient fallback
- Missing cover images for 2 articles: `errori-eventi.jpg`, `whatsapp-vs-email.jpg`
- No search functionality
- No RSS feed
- No comments system
- No article view counter
- No social sharing buttons (only placeholder translation key)
- Pagination is client-side only
