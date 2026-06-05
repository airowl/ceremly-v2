import { defineCollection, defineContentConfig } from '@nuxt/content'
import { z } from 'zod'

export default defineContentConfig({
  collections: {
    blog: defineCollection({
      type: 'page',
      source: 'blogs/*.md',
      schema: z.object({
        title: z.string(),
        description: z.string(),
        date: z.string(),
        cover: z.string().optional(),
        coverAlt: z.string().optional(),
        tags: z.array(z.string()),
        author: z.string(),
        authorAvatar: z.string().optional(),
        featured: z.boolean().default(false),
        published: z.boolean().default(true),
        locale: z.enum(['it', 'en']).default('it'),
        translationSlug: z.string().optional(),
      }),
    }),
  },
})
