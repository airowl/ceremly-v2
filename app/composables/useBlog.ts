import type { BlogTag } from '~~/shared/utils/blog'

export function useBlog() {
  /**
   * Calculates the estimated reading time (average 200 wpm for Italian)
   */
  function calculateReadingTime(text: string): number {
    const words = text.trim().split(/\s+/).length
    return Math.max(1, Math.ceil(words / 200))
  }

  /**
   * Formats the article date using Intl.DateTimeFormat
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
   * Extracts unique tags with count from an array of articles
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
