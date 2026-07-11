/**
 * Emits reciprocal in-head hreflang alternates (it-IT / en-US / x-default) for
 * "path-shared" pages — pages that use the SAME slug across locales under
 * `prefix_except_default` (IT at `/path`, EN at `/en/path`).
 *
 * Call this once per page setup() on marketing/content/legal pages.
 *
 * NOT for `app/pages/blogs/[slug].vue`: blog posts have DIFFERENT slugs per
 * locale (IT `/blogs/come-iniziare` vs EN `/en/blogs/getting-started`) and
 * already emit their own correct manual hreflang via `useHead` — applying
 * this composable there would assume a same-slug EN URL that does not exist.
 *
 * Why not the i18n-native `useLocaleHead()` for this instead: that composable
 * has no per-route scoping option (its `I18nHeadOptions`/`SeoAttributesOptions`
 * types expose only `lang`/`dir`/`seo`/`canonicalQueries`, no path exclusion),
 * so a single global call in `app.vue` cannot be suppressed for the blog page
 * without a hand-rolled opt-out — at which point this targeted composable is
 * simpler and keeps the blog's existing manual pattern untouched.
 */
export function useAltHreflang() {
  const switchLocalePath = useSwitchLocalePath()
  const runtimeConfig = useRuntimeConfig()
  const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

  useHead({
    link: computed(() => {
      const itPath = switchLocalePath('it')
      const enPath = switchLocalePath('en')
      if (!itPath || !enPath) return []

      return [
        { rel: 'alternate', hreflang: 'it-IT', href: `${baseUrl}${itPath}` },
        { rel: 'alternate', hreflang: 'en-US', href: `${baseUrl}${enPath}` },
        { rel: 'alternate', hreflang: 'x-default', href: `${baseUrl}${itPath}` },
      ]
    }),
  })
}
