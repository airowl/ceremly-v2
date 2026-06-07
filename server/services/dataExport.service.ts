/**
 * Data Export Service
 * Business logic for GDPR data export: collection, generation, and management.
 */
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDB } from '../utils/db';
import {
    dataExports,
    user,
    file,
    auditLog,
    creem_subscription,
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

    // STUB phase 1a — query su schema.events/eventUsers rimossa insieme alla tabella.
    // 1c: ripristinare con organization/member lookup via Better Auth org plugin.
    const allEvents: ExportEvent[] = [];

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

    const pending = await db.query.dataExports.findFirst({
        where: and(
            eq(dataExports.userId, userId),
            eq(dataExports.status, 'pending'),
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
