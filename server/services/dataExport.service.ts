/**
 * Data Export Service
 * Business logic for GDPR data export: collection, generation, and management.
 */
import { eq, and, ne, desc, inArray, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDB } from '../utils/db';
import {
    dataExports,
    user,
    file,
    auditLog,
    creem_subscription,
    member,
    events,
    type ExportStatus,
} from '../database/schema';

// Type for data export record
export interface DataExportRecord {
    id: string;
    userId: string;
    status: ExportStatus;
    format: string;
    downloadUrl: string | null;
    downloadToken: string | null;
    expiresAt: Date | null;
    completedAt: Date | null;
    errorMessage: string | null;
    fileSize: number | null;
    createdAt: Date;
}

export interface ExportUserProfile {
    id: string;
    name: string | null;
    email: string;
    emailVerified: boolean;
    phone: string | null;
    image: string | null;
    bio: string | null;
    locale: string | null;
    role: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface ExportEvent {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    date: string;
    location: string | null;
    isOwner: boolean;
    role: string;
    createdAt: Date;
}

export interface ExportFile {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    createdAt: Date;
}

export interface ExportAuditLog {
    id: number;
    action: string;
    targetType: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
}

export interface ExportSubscription {
    id: string;
    productId: string;
    status: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
}

export interface ExportData {
    user: ExportUserProfile;
    events: ExportEvent[];
    files: ExportFile[];
    auditLogs: ExportAuditLog[];
    subscriptions: ExportSubscription[];
    exportedAt: string;
    exportVersion: string;
}

/**
 * Collect all user data for GDPR export
 */
export async function collectUserData(userId: string): Promise<ExportData> {
    const db = getDB();

    // Get user profile
    const userProfile = await db.query.user.findFirst({
        where: eq(user.id, userId),
        columns: {
            id: true,
            name: true,
            email: true,
            emailVerified: true,
            phone: true,
            image: true,
            bio: true,
            locale: true,
            role: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    if (!userProfile) {
        throw new Error('User not found');
    }

    // Events from orgs the user is a member of (GDPR data portability): memberships
    // (role) are resolved and org-scoped events are collected.
    const memberships = await db
        .select({ organizationId: member.organizationId, role: member.role })
        .from(member)
        .where(eq(member.userId, userId));
    const orgIds = memberships.map((m) => m.organizationId);
    const roleByOrg = new Map(memberships.map((m) => [m.organizationId, m.role]));

    let allEvents: ExportEvent[] = [];
    if (orgIds.length > 0) {
        const rows = await db
            .select({
                id: events.id,
                title: events.title,
                slug: events.slug,
                type: events.type,
                eventDate: events.eventDate,
                locationName: events.locationName,
                organizationId: events.organizationId,
                createdAt: events.createdAt,
            })
            .from(events)
            .where(inArray(events.organizationId, orgIds))
            .orderBy(desc(events.createdAt))
            .limit(1000);
        allEvents = rows.map((e) => {
            const role = roleByOrg.get(e.organizationId) ?? 'member';
            return {
                id: e.id,
                name: e.title,
                slug: e.slug,
                description: e.type,
                date: e.eventDate ? e.eventDate.toISOString() : '',
                location: e.locationName,
                isOwner: role === 'owner',
                role,
                createdAt: e.createdAt,
            };
        });
    }

    // Get files (metadata only, no content)
    const userFiles = await db.query.file.findMany({
        where: eq(file.uploadedBy, userId),
        columns: {
            id: true,
            originalName: true,
            mimeType: true,
            size: true,
            createdAt: true,
        },
        orderBy: [desc(file.createdAt)],
        limit: 1000,
    });

    const exportFiles: ExportFile[] = userFiles.map((f) => ({
        id: f.id,
        originalName: f.originalName,
        mimeType: f.mimeType,
        size: f.size,
        createdAt: f.createdAt,
    }));

    // Get audit logs
    const userAuditLogs = await db.query.auditLog.findMany({
        where: eq(auditLog.userId, userId),
        columns: {
            id: true,
            action: true,
            targetType: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
        },
        orderBy: [desc(auditLog.createdAt)],
        limit: 1000,
    });

    // Get subscriptions (referenceId links to user ID in Better Auth Creem plugin)
    const userSubscriptions = await db.query.creem_subscription.findMany({
        where: eq(creem_subscription.referenceId, userId),
        columns: {
            id: true,
            productId: true,
            status: true,
            periodStart: true,
            periodEnd: true,
        },
    });

    return {
        user: userProfile,
        events: allEvents,
        files: exportFiles,
        auditLogs: userAuditLogs,
        subscriptions: userSubscriptions,
        exportedAt: new Date().toISOString(),
        exportVersion: '2.0',
    };
}

/**
 * Generate export file and return JSON string
 */
export function generateExportFile(data: ExportData): { content: string; size: number } {
    const jsonContent = JSON.stringify(data, null, 2);
    return {
        content: jsonContent,
        size: Buffer.byteLength(jsonContent, 'utf8'),
    };
}

/**
 * Create a new data export request
 */
export async function createDataExportRequest(userId: string): Promise<string> {
    const db = getDB();
    const id = nanoid();
    const downloadToken = nanoid(32);

    await db.insert(dataExports).values({
        id,
        userId,
        status: 'pending',
        format: 'json',
        downloadToken,
    });

    return id;
}

/**
 * Update export status
 */
export async function updateExportStatus(
    exportId: string,
    status: ExportStatus,
    data?: {
        downloadUrl?: string;
        errorMessage?: string;
        fileSize?: number;
        expiresAt?: Date;
        completedAt?: Date;
    },
): Promise<void> {
    const db = getDB();

    await db
        .update(dataExports)
        .set({
            status,
            ...data,
        })
        .where(eq(dataExports.id, exportId));
}

/**
 * Atomically claim an export for processing. Flips status → 'processing' only
 * if it is NOT already 'processing', returning whether THIS call won the claim.
 * Guards against QStash redelivering a long-running job before the first
 * invocation finishes: the unconditional updateExportStatus('processing') was
 * not concurrency-safe (a redelivery would re-run processExport, duplicating
 * R2 work and racing the final row). A 'failed' export is reclaimable (retry).
 */
export async function claimExportForProcessing(exportId: string): Promise<boolean> {
    const db = getDB();
    const claimed = await db
        .update(dataExports)
        .set({ status: 'processing' })
        .where(and(eq(dataExports.id, exportId), ne(dataExports.status, 'processing')))
        .returning({ id: dataExports.id });
    return claimed.length > 0;
}

/**
 * Exports stuck in 'pending'/'processing' longer than this are dead: the QStash
 * retry window (3 retries, exponential backoff) spans ~35 minutes from enqueue,
 * so after an hour no delivery can still be in flight.
 */
const STALE_EXPORT_MINUTES = 60;

/**
 * Self-heal exports orphaned by a hard kill (Vercel timeout/OOM mid-processExport):
 * the catch that flips status → 'failed' never runs, the QStash redelivery is
 * skipped by the claim and answered 200, and the row stays 'pending'/'processing'
 * forever — blocking the user via hasPendingExport() with no recovery path.
 * Flipping stale rows to 'failed' unblocks new requests and surfaces the retry
 * button in the UI (shown for 'failed'/'expired' only).
 */
export async function failStaleExports(userId: string): Promise<void> {
    const db = getDB();
    const cutoff = new Date(Date.now() - STALE_EXPORT_MINUTES * 60 * 1000);

    await db
        .update(dataExports)
        .set({ status: 'failed', errorMessage: 'Export timed out. Please try again.' })
        .where(and(
            eq(dataExports.userId, userId),
            inArray(dataExports.status, ['pending', 'processing']),
            lt(dataExports.createdAt, cutoff),
        ));
}

/**
 * Get export by download token
 */
export async function getExportByToken(token: string) {
    const db = getDB();

    return db.query.dataExports.findFirst({
        where: and(eq(dataExports.downloadToken, token), eq(dataExports.status, 'completed')),
    });
}

/**
 * Get export request by id (used for idempotency in the queue consumer).
 */
export async function getExportById(exportId: string) {
    const db = getDB();

    return db.query.dataExports.findFirst({
        where: eq(dataExports.id, exportId),
    });
}

/**
 * Get user's export history
 */
export async function getExportHistory(userId: string, limit = 10) {
    const db = getDB();

    return db.query.dataExports.findMany({
        where: eq(dataExports.userId, userId),
        orderBy: [desc(dataExports.createdAt)],
        limit,
    });
}

/**
 * Check if user has a pending export
 */
export async function hasPendingExport(userId: string): Promise<boolean> {
    const db = getDB();

    // Include 'processing': an export in progress is still in flight, otherwise
    // the user could start a concurrent one within the pending→processing window.
    const pending = await db.query.dataExports.findFirst({
        where: and(
            eq(dataExports.userId, userId),
            inArray(dataExports.status, ['pending', 'processing']),
        ),
    });

    return !!pending;
}

/**
 * Process export (collect data and generate file)
 * In production, this would be run as a background job
 */
export async function processExport(exportId: string, userId: string): Promise<void> {
    try {
        // Update status to processing
        await updateExportStatus(exportId, 'processing');

        // Collect user data
        const data = await collectUserData(userId);

        // Generate export file
        const { content, size } = generateExportFile(data);

        const base64Content = Buffer.from(content).toString('base64');

        // Set expiration to 24 hours from now
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        await updateExportStatus(exportId, 'completed', {
            downloadUrl: `data:application/json;base64,${base64Content}`,
            fileSize: size,
            expiresAt,
            completedAt: new Date(),
        });
    } catch (error) {
        await updateExportStatus(exportId, 'failed', {
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
    }
}
