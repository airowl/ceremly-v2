import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { useConvexAction } from "~/composables/useConvexAction";

export interface UploadedPublicFile {
    fileId: Id<"files">;
    /** Public URL of the surviving file (after dedup it is the existing one). */
    url: string;
}

/**
 * Public uploads, presign → PUT → confirm (Task 14, part c).
 *
 * Before: the page posted a `FormData` to `/api/file/upload`, so every byte went
 * through the Nuxt runtime (and on a Worker, through its memory and body limits).
 * Now the bytes go straight from the browser to R2:
 *
 * 1. `api.files.presignUpload` (Convex) authorizes, validates type/size, applies
 *    the presign budget and asks the storage bridge for a 15-minute PUT URL;
 * 2. the browser `PUT`s the file to that URL (R2, allowed by `connect-src`);
 * 3. `api.files.confirmUpload` (Convex) makes the bridge inspect the object —
 *    magic bytes, SHA-256 dedup, variant scheduling — and returns the public URL.
 *
 * Nothing here names the organization: the file belongs to the caller's active
 * organization, resolved server-side. Every step is audited in Convex
 * (`file.presign_requested`, `file.upload_confirmed`, `file.uploaded`).
 *
 * Operational prerequisite: the R2 bucket must allow a CORS `PUT` from the site
 * origin with a `Content-Type` header, or step 2 fails in the browser.
 */
export function useStorageUpload() {
    const presign = useConvexAction(api.files.presignUpload);
    const confirm = useConvexAction(api.files.confirmUpload);

    async function uploadPublicFile(file: File): Promise<UploadedPublicFile> {
        const ticket = await presign({
            originalName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            isPublic: true,
        });

        // The Content-Type is part of the signature: it must be the declared one.
        const response = await fetch(ticket.presignedUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
        });
        if (!response.ok) {
            throw new Error(`Upload to storage failed (${response.status})`);
        }

        const confirmed = await confirm({ fileId: ticket.fileId });
        if (!confirmed.url) {
            // A public upload without a URL cannot be shown anywhere: treat it as
            // a failed upload instead of storing `null` as an image.
            throw new Error("Public URL not available");
        }

        return { fileId: confirmed.fileId, url: confirmed.url };
    }

    return { uploadPublicFile };
}
