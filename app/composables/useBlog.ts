import type { BlogTag } from '~~/shared/utils/blog'

export function useBlog() {
  /**
   * Calcola il tempo di lettura stimato (media 200 wpm per l'italiano)
   */
  function calculateReadingTime(text: string): number {
    const words = text.trim().split(/\s+/).length
    return Math.max(1, Math.ceil(words / 200))
  }

  /**
   * Formatta la data dell'articolo con Intl.DateTimeFormat
   */
  function formatArticleDate(dateString: string, locale: string): string {
    const date = new Date(dateString)
    const resolvedLocale = locale.startsWith('it') ? 'it-IT' : 'en-US'
    return new Intl.DateTimeFormat(resolvedLocale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date)
  }

  /**
   * Estrai tag unici con conteggio da un array di articoli
   */
  function extractTags(articles: Array<{ tags?: string[] }>): BlogTag[] {
    const tagMap = new Map<string, number>()
    for (const article of articles) {
      if (!article.tags) continue
      for (const tag of article.tags) {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1)
      }
    }
    return Array.from(tagMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }

  return {
    calculateReadingTime,
    formatArticleDate,
    extractTags,
  }
}
