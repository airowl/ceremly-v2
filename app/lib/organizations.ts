/**
 * Adapters between the Convex organization API and the shapes the organization
 * UI was written against (Task 14, part b).
 *
 * The UI was born on the Better Auth organization plugin payload: string ids,
 * ISO dates, `member.user.{name,email,image}`. Convex returns `_id`-style ids
 * under explicit names (`organizationId`, `membershipId`, `invitationId`) and
 * epoch milliseconds. The conversion lives here, in pure functions, so it can be
 * tested without Nuxt globals (same reason as `app/lib/publicInvite.ts`).
 */

export type OrgRole = "owner" | "admin" | "member";

export interface OrganizationListItem {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    createdAt: string;
    role: OrgRole;
    isActive: boolean;
}

/** The caller's active organization, with the caller's role in it. */
export interface OrganizationSummary {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    role: OrgRole;
}

export interface OrganizationMember {
    /** Membership row id: stable per (organization, user), used as the list key. */
    id: string;
    /** `appUsers` id: what member writes (`updateMemberRole`, `removeMember`) take. */
    userId: string;
    role: OrgRole;
    createdAt: string;
    /** Answered by the server: the UI cannot compare a Better Auth id with an app user id. */
    isSelf: boolean;
    user: {
        name: string;
        email: string;
        image: string | null;
    };
}

export interface OrganizationInvitation {
    id: string;
    email: string;
    role: OrgRole;
    status: "pending";
    expiresAt: string;
}

/** What the `/invite/{token}` page shows before accepting. */
export interface InvitationPreview {
    email: string;
    role: OrgRole;
    status: "pending" | "accepted" | "canceled" | "expired";
    expiresAt: string;
    organizationName: string;
    /** Inviter's display name, falling back to their email (legacy page showed the email). */
    inviterName: string;
}

const toIso = (milliseconds: number): string => new Date(milliseconds).toISOString();

export function toOrganizationListItem(row: {
    organizationId: string;
    name: string;
    slug: string;
    logo: string | null;
    createdAt: number;
    role: OrgRole;
    isActive: boolean;
}): OrganizationListItem {
    return {
        id: row.organizationId,
        name: row.name,
        slug: row.slug,
        logo: row.logo,
        createdAt: toIso(row.createdAt),
        role: row.role,
        isActive: row.isActive,
    };
}

export function toOrganizationSummary(row: {
    organizationId: string;
    name: string;
    slug: string;
    logo: string | null;
    role: OrgRole;
} | null | undefined): OrganizationSummary | null {
    if (!row) return null;
    return {
        id: row.organizationId,
        name: row.name,
        slug: row.slug,
        logo: row.logo,
        role: row.role,
    };
}

export function toOrganizationMember(row: {
    membershipId: string;
    userId: string;
    email: string;
    name: string | null;
    image: string | null;
    role: OrgRole;
    createdAt: number;
    isSelf: boolean;
}): OrganizationMember {
    return {
        id: row.membershipId,
        userId: row.userId,
        role: row.role,
        createdAt: toIso(row.createdAt),
        isSelf: row.isSelf,
        user: {
            // A member without a display name is shown by address, never as blank.
            name: row.name ?? row.email,
            email: row.email,
            image: row.image,
        },
    };
}

export function toOrganizationInvitation(row: {
    invitationId: string;
    email: string;
    role: OrgRole;
    expiresAt: number;
}): OrganizationInvitation {
    return {
        id: row.invitationId,
        email: row.email,
        role: row.role,
        status: "pending",
        expiresAt: toIso(row.expiresAt),
    };
}

export function toInvitationPreview(row: {
    email: string;
    role: OrgRole;
    /** `rejected` exists in the schema (plugin parity); for this page it is as final as `canceled`. */
    status: "pending" | "accepted" | "canceled" | "rejected" | "expired";
    expiresAt: number;
    organizationName: string | null;
    inviterName: string | null;
    inviterEmail: string | null;
} | null | undefined): InvitationPreview | null {
    if (!row) return null;
    return {
        email: row.email,
        role: row.role,
        status: row.status === "rejected" ? "canceled" : row.status,
        expiresAt: toIso(row.expiresAt),
        organizationName: row.organizationName ?? "",
        inviterName: row.inviterName ?? row.inviterEmail ?? "",
    };
}

/**
 * The `/invite/{token}` URL contract (Task 14, part b): the segment is the 64-hex
 * token the invitation email carries. A legacy plugin id (the old
 * `/invite/{invitationId}` links) is not a token and is rejected before any
 * query — pending legacy invitations are not imported and must be re-issued
 * (Task 10).
 */
export const isInvitationToken = (value: string): boolean => /^[0-9a-f]{64}$/.test(value);
