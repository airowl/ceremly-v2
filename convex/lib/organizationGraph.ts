import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { deleteLimitOverrides } from "./limitOverrides";

/**
 * The organization's domain graph, in one place (final review I1).
 *
 * Convex has no `ON DELETE CASCADE`: the legacy `organization → events →
 * guests/rsvp/activities/reminders`, `projects`, `files`, `invitations`,
 * `members` cascade came from foreign keys. Three callers need it:
 *
 * - the account purge (`profile.purgeApply`), which deletes a sole-member
 *   organization in one transaction after the job has removed its R2 objects
 *   (`deleteOrganizationGraph`);
 * - the stale-event cron, which drains one event at a time
 *   (`deleteEventChildren`);
 * - the organization delete from the UI (`organizations.deleteOrganization`),
 *   which removes the organization row at once and drains the rest in batches
 *   through the durable `organization-purge` job (`drainOrganizationGraph`),
 *   because a large organization does not fit one transaction.
 */

/**
 * Deletes an event's children in batches and says whether any remain.
 *
 * Order does not matter for integrity (no foreign keys) but it does for
 * observability: if the process stops midway, what is left is an event without
 * children, not a child without an event.
 */
export async function deleteEventChildren(
    ctx: MutationCtx,
    eventId: Id<"events">,
    batch: number,
): Promise<{ removed: number; leftover: boolean }> {
    let removed = 0;

    for (const row of await ctx.db
        .query("rsvpResponses")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(batch)) {
        await ctx.db.delete(row._id);
        removed += 1;
    }

    for (const row of await ctx.db
        .query("guestActivities")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(batch)) {
        await ctx.db.delete(row._id);
        removed += 1;
    }

    for (const row of await ctx.db
        .query("eventReminders")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(batch)) {
        await ctx.db.delete(row._id);
        removed += 1;
    }

    for (const row of await ctx.db
        .query("inviteTestRequests")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(batch)) {
        await ctx.db.delete(row._id);
        removed += 1;
    }

    for (const row of await ctx.db
        .query("guests")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(batch)) {
        await ctx.db.delete(row._id);
        removed += 1;
    }

    // A single leftover document is enough to say "not yet": the event stays a
    // candidate for the next pass, so a partial delete is never lost.
    const leftovers = [
        await ctx.db.query("guests").withIndex("by_event", (q) => q.eq("eventId", eventId)).take(1),
        await ctx.db.query("rsvpResponses").withIndex("by_event", (q) => q.eq("eventId", eventId)).take(1),
        await ctx.db.query("guestActivities").withIndex("by_event", (q) => q.eq("eventId", eventId)).take(1),
        await ctx.db.query("eventReminders").withIndex("by_event", (q) => q.eq("eventId", eventId)).take(1),
        await ctx.db
            .query("inviteTestRequests")
            .withIndex("by_event", (q) => q.eq("eventId", eventId))
            .take(1),
    ];

    return { removed, leftover: leftovers.some((rows) => rows.length > 0) };
}

/**
 * One bounded pass over a **deleted** organization's graph, files excluded.
 *
 * Files are not here on purpose: their R2 object must be deleted first, by the
 * job's action (network, not transaction), and only then the row — otherwise a
 * failed delete would lose the only reference to the object.
 */
export async function drainOrganizationGraph(
    ctx: MutationCtx,
    organizationId: Id<"organizations">,
    batch: number,
): Promise<{ removed: number; leftover: boolean }> {
    let removed = 0;

    for (const event of await ctx.db
        .query("events")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .take(5)) {
        const children = await deleteEventChildren(ctx, event._id, batch);
        removed += children.removed;
        if (children.leftover) continue;
        await ctx.db.delete(event._id);
        removed += 1;
    }

    for (const project of await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .take(batch)) {
        await ctx.db.delete(project._id);
        removed += 1;
    }

    for (const request of await ctx.db
        .query("inviteTestRequests")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .take(batch)) {
        await ctx.db.delete(request._id);
        removed += 1;
    }

    for (const invitation of await ctx.db
        .query("invitations")
        .withIndex("by_org_status", (q) => q.eq("organizationId", organizationId))
        .take(batch)) {
        await ctx.db.delete(invitation._id);
        removed += 1;
    }

    for (const membership of await ctx.db
        .query("memberships")
        .withIndex("by_organization_role", (q) => q.eq("organizationId", organizationId))
        .take(batch)) {
        await ctx.db.delete(membership._id);
        removed += 1;
    }

    await deleteLimitOverrides(ctx, organizationId);

    const leftovers = [
        await ctx.db.query("events").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(1),
        await ctx.db.query("projects").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(1),
        await ctx.db
            .query("inviteTestRequests")
            .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
            .take(1),
        await ctx.db
            .query("invitations")
            .withIndex("by_org_status", (q) => q.eq("organizationId", organizationId))
            .take(1),
        await ctx.db
            .query("memberships")
            .withIndex("by_organization_role", (q) => q.eq("organizationId", organizationId))
            .take(1),
    ];

    return { removed, leftover: leftovers.some((rows) => rows.length > 0) };
}

/**
 * Cascade of an organization's whole graph in one transaction (legacy
 * `deleteOrganizationGraph`). The caller has already deleted the R2 objects of
 * the organization's files (the account-purge job does it before calling).
 */
export async function deleteOrganizationGraph(
    ctx: MutationCtx,
    organizationId: Id<"organizations">,
): Promise<void> {
    const events = await ctx.db
        .query("events")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .collect();

    for (const event of events) {
        const guests = await ctx.db
            .query("guests")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect();
        for (const guest of guests) {
            for (const response of await ctx.db
                .query("rsvpResponses")
                .withIndex("by_guest", (q) => q.eq("guestId", guest._id))
                .collect()) {
                await ctx.db.delete(response._id);
            }
            for (const activity of await ctx.db
                .query("guestActivities")
                .withIndex("by_guest", (q) => q.eq("guestId", guest._id))
                .collect()) {
                await ctx.db.delete(activity._id);
            }
            await ctx.db.delete(guest._id);
        }

        for (const reminder of await ctx.db
            .query("eventReminders")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect()) {
            await ctx.db.delete(reminder._id);
        }

        for (const request of await ctx.db
            .query("inviteTestRequests")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect()) {
            await ctx.db.delete(request._id);
        }

        await ctx.db.delete(event._id);
    }

    for (const project of await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .collect()) {
        await ctx.db.delete(project._id);
    }

    // Task 15: the admin limit override goes with the organization.
    await deleteLimitOverrides(ctx, organizationId);

    for (const file of await ctx.db
        .query("files")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .collect()) {
        await ctx.db.delete(file._id);
    }

    // The organization's invitations go with it (the legacy cascade came from
    // foreign keys). The index is `by_org_status`: any status.
    for (const invitation of await ctx.db
        .query("invitations")
        .withIndex("by_org_status", (q) => q.eq("organizationId", organizationId))
        .collect()) {
        await ctx.db.delete(invitation._id);
    }

    for (const membership of await ctx.db
        .query("memberships")
        .withIndex("by_organization_role", (q) => q.eq("organizationId", organizationId))
        .collect()) {
        await ctx.db.delete(membership._id);
    }

    await ctx.db.delete(organizationId);
}
