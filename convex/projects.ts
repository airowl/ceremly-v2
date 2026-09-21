import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { requireActiveOrganization } from "./lib/authorization";
import { writeAudit } from "./lib/audit";
import { forbidden } from "./lib/identity";

/**
 * Progetti (plan Task 11) — l'entità di esempio org-scoped.
 *
 * È il porting di `server/services/project.service.ts`, che il repo indica come la
 * ricetta da replicare: `organizationId` mai dall'input, query scoped
 * by-construction, "non trovato" invece di "vietato" sui by-id, audit su ogni
 * scrittura. La differenza è che qui l'audit e la scrittura sono la **stessa**
 * transazione.
 */

const projectStatus = v.union(v.literal("active"), v.literal("archived"));

export const list = query({
    args: { paginationOpts: paginationOptsValidator },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);

        return await ctx.db
            .query("projects")
            .withIndex("by_organization_created", (q) => q.eq("organizationId", authz.organizationId))
            .order("desc")
            .paginate(args.paginationOpts);
    },
});

export const get = query({
    args: { projectId: v.id("projects") },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        const project = await ctx.db.get(args.projectId);

        // Un progetto di un'altra organizzazione è indistinguibile da uno
        // inesistente: nessun oracolo sull'esistenza.
        if (!project || project.organizationId !== authz.organizationId) {
            throw forbidden("PROJECT_NOT_FOUND", { projectId: args.projectId });
        }

        return project;
    },
});

export const create = mutation({
    args: {
        input: v.object({
            name: v.string(),
            description: v.optional(v.union(v.string(), v.null())),
            status: v.optional(projectStatus),
        }),
    },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        const now = Date.now();

        const projectId = await ctx.db.insert("projects", {
            organizationId: authz.organizationId,
            name: args.input.name,
            status: args.input.status ?? "active",
            ...(args.input.description ? { description: args.input.description } : {}),
            createdAt: now,
            updatedAt: now,
        });

        await writeAudit(ctx, {
            action: "project.created",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "project",
            targetId: projectId,
        });

        return { projectId };
    },
});

export const update = mutation({
    args: {
        projectId: v.id("projects"),
        input: v.object({
            name: v.optional(v.string()),
            description: v.optional(v.union(v.string(), v.null())),
            status: v.optional(projectStatus),
        }),
    },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        const project = await ctx.db.get(args.projectId);
        if (!project || project.organizationId !== authz.organizationId) {
            throw forbidden("PROJECT_NOT_FOUND", { projectId: args.projectId });
        }

        const next: Record<string, unknown> = { ...project };
        delete next._id;
        delete next._creationTime;

        if (args.input.name !== undefined) next.name = args.input.name;
        if (args.input.status !== undefined) next.status = args.input.status;
        if (args.input.description !== undefined) {
            // `null` svuota il campo: assente è come il modello rappresenta null.
            if (args.input.description === null) delete next.description;
            else next.description = args.input.description;
        }
        next.updatedAt = Date.now();

        await ctx.db.replace(project._id, next as never);

        await writeAudit(ctx, {
            action: "project.updated",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "project",
            targetId: project._id,
            details: { fields: Object.keys(args.input) },
        });

        return { success: true };
    },
});

export const remove = mutation({
    args: { projectId: v.id("projects") },
    handler: async (ctx, args) => {
        const authz = await requireActiveOrganization(ctx);
        const project = await ctx.db.get(args.projectId);
        if (!project || project.organizationId !== authz.organizationId) {
            throw forbidden("PROJECT_NOT_FOUND", { projectId: args.projectId });
        }

        await ctx.db.delete(project._id);

        await writeAudit(ctx, {
            action: "project.deleted",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "project",
            targetId: project._id,
        });

        return { success: true };
    },
});
