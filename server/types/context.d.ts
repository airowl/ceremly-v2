/**
 * H3 Event Context type augmentation
 * Populated by server middleware (1.auth, 2.events)
 */
declare module 'h3' {
    interface H3EventContext {
        /** Authenticated user — injected by 1.auth.ts (optional) or requireAuth() (required) */
        user?: {
            id: string
            email: string
            name: string | null
            role: string | null
            image?: string | null
        }
        /** Event data — injected by 2.events.ts for /api/events/[id]/* routes */
        userEvent?: {
            id: string
            name: string
            slug: string
            description: string | null
            userId: string
            date: string
            createdAt: Date
            updatedAt: Date
        }
        /** User access/role in event — injected by 2.events.ts */
        eventAccess?: {
            isOwner: boolean
            permissions: string[]
        }
    }
}
