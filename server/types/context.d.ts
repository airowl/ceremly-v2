/**
 * H3 Event Context type augmentation
 * Populated by server middleware (1.auth, 2.organization) and RBAC guards.
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
        /**
         * Member's active org — populated by RBAC guards (requireMember/requireWrite/
         * requireOwner) or by middleware 2.organization.ts (non-blocking).
         * The service reads organizationId ONLY from here (never from body/query).
         */
        organization?: {
            id: string
            role: string
        }
    }
}
