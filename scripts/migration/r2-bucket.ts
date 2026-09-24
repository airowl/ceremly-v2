import { AwsClient } from "aws4fetch";

/**
 * Read-only inventory of the R2 bucket (Task 16, fix round 1).
 *
 * The object bytes are not migrated (same bucket, keys unchanged), so the
 * reconciliation must look at the bucket itself: every file row must point at an
 * object that exists with the recorded size, and every object in the file
 * namespace must belong to a row. Only `ListObjectsV2` is ever issued: this
 * module has no code path that writes to the bucket.
 */

export interface BucketObject {
    key: string;
    size: number;
    etag: string | null;
}

export interface BucketPage {
    objects: BucketObject[];
    nextToken: string | null;
}

/** One `ListObjectsV2` page. The seam the hermetic tests replace with a fake. */
export interface BucketLister {
    list(continuationToken: string | null): Promise<BucketPage>;
}

export async function listAllObjects(lister: BucketLister): Promise<BucketObject[]> {
    const objects: BucketObject[] = [];
    let token: string | null = null;
    for (let guard = 0; guard < 100_000; guard += 1) {
        const page = await lister.list(token);
        objects.push(...page.objects);
        if (!page.nextToken) return objects;
        token = page.nextToken;
    }
    throw new Error("Bucket listing did not terminate");
}

const decodeXml = (value: string): string =>
    value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");

/** Parses a `ListObjectsV2` XML response (the subset R2 returns). */
export function parseListObjectsV2(xml: string): BucketPage {
    const objects: BucketObject[] = [];
    for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const body = match[1]!;
        const key = /<Key>([\s\S]*?)<\/Key>/.exec(body)?.[1];
        const size = /<Size>(\d+)<\/Size>/.exec(body)?.[1];
        const etag = /<ETag>([\s\S]*?)<\/ETag>/.exec(body)?.[1];
        if (key === undefined || size === undefined) throw new Error("Malformed ListObjectsV2 entry");
        objects.push({ key: decodeXml(key), size: Number(size), etag: etag ? decodeXml(etag).replace(/"/g, "") : null });
    }
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    const next = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1];
    return { objects, nextToken: truncated && next ? decodeXml(next) : null };
}

/** Real lister over the R2 S3 API, GET only. */
export function r2Lister(options: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
}): BucketLister {
    const client = new AwsClient({
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        service: "s3",
        region: "auto",
    });
    const base = `https://${options.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(options.bucket)}`;

    return {
        async list(continuationToken) {
            const params = new URLSearchParams({ "list-type": "2", "max-keys": "1000" });
            if (continuationToken) params.set("continuation-token", continuationToken);
            const response = await client.fetch(`${base}?${params.toString()}`, { method: "GET" });
            if (!response.ok) throw new Error(`R2 ListObjectsV2 failed (HTTP ${response.status})`);
            return parseListObjectsV2(await response.text());
        },
    };
}

/** `r2Lister` from the legacy `.env` names, or `null` when the credentials are absent. */
export function r2ListerFromEnv(env: NodeJS.ProcessEnv): BucketLister | null {
    const accountId = env.NUXT_CF_ACCOUNT_ID;
    const accessKeyId = env.NUXT_CF_ACCESS_KEY_ID;
    const secretAccessKey = env.NUXT_CF_SECRET_ACCESS_KEY;
    const bucket = env.NUXT_CF_R2_BUCKET_NAME;
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
    return r2Lister({ accountId, accessKeyId, secretAccessKey, bucket });
}
