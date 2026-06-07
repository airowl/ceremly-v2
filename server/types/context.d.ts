/**
 * H3 Event Context type augmentation
 * Populated by server middleware (1.auth, 2.organization) e dai guard RBAC.
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
         * Org attiva del membro — popolata dai guard RBAC (requireMember/requireWrite/
         * requireOwner) o dal middleware 2.organization.ts (non-bloccante).
         * Il service legge organizationId SOLO da qui (mai da body/query).
         */
        organization?: {
            id: string
            role: string
        }
    }
}
