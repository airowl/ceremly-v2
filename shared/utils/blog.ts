export interface BlogArticleMeta {
  title: string
  description: string
  date: string
  cover?: string
  coverAlt?: string
  tags: string[]
  author: string
  authorAvatar?: string
  featured: boolean
  published: boolean
  locale: 'it' | 'en'
  translationSlug?: string
}

export interface BlogTag {
  name: string
  count: number
}
