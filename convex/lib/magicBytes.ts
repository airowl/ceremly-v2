/**
 * Magic-bytes validation inside Convex (plan Task 7, Step 2: "magic bytes prima
 * dello stato `ready`").
 *
 * Convex bundles only files under `convex/`, so this mirrors
 * `server/services/file/magicBytes.ts` — the same signatures, the same
 * allow-by-default for unknown formats. `test/migration/magic-bytes-contract.test.ts`
 * feeds both the same byte samples and fails if they ever disagree, which is the
 * only reason a copy is acceptable here.
 *
 * Why it runs in Convex and not only in the Worker: the Worker reads the bytes,
 * but the *decision to mark a file ready* is a database transition. Validating
 * inside the mutation makes "bytes checked" and "file ready" the same
 * transaction, so a bridge bug or a crafted object cannot produce a ready file
 * whose content never matched its declared type.
 */

interface MagicSignature {
    bytes: number[];
    offset: number;
}

interface MagicRule {
    mimeTypes: string[];
    signatures: MagicSignature[];
    additionalCheck?: (data: Uint8Array) => boolean;
}

const MAGIC_RULES: MagicRule[] = [
    {
        mimeTypes: ["image/jpeg"],
        signatures: [{ bytes: [0xff, 0xd8, 0xff], offset: 0 }],
    },
    {
        mimeTypes: ["image/png"],
        signatures: [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 }],
    },
    {
        mimeTypes: ["image/gif"],
        signatures: [{ bytes: [0x47, 0x49, 0x46, 0x38], offset: 0 }],
    },
    {
        mimeTypes: ["image/webp"],
        signatures: [{ bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }],
        additionalCheck: (data) =>
            data.length >= 12 &&
            data[8] === 0x57 && // W
            data[9] === 0x45 && // E
            data[10] === 0x42 && // B
            data[11] === 0x50, // P
    },
    {
        mimeTypes: ["application/pdf"],
        signatures: [{ bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 }],
    },
    {
        mimeTypes: ["image/avif"],
        signatures: [{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }],
        additionalCheck: (data) => {
            if (data.length < 12) return false;
            const brand = String.fromCharCode(data[8]!, data[9]!, data[10]!, data[11]!);
            return brand === "avif" || brand === "avis";
        },
    },
];

function matchesSignature(data: Uint8Array, signature: MagicSignature): boolean {
    if (data.length < signature.offset + signature.bytes.length) return false;
    for (let index = 0; index < signature.bytes.length; index += 1) {
        if (data[signature.offset + index] !== signature.bytes[index]) return false;
    }
    return true;
}

/**
 * `true` when the bytes match the declared MIME type, or when the type is one we
 * have no signature for (allow-by-default for unknown formats — legacy parity).
 */
export function validateMagicBytes(data: Uint8Array, declaredMimeType: string): boolean {
    if (declaredMimeType === "image/svg+xml") {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(data.slice(0, 256));
        return /<svg[\s>]/i.test(text);
    }

    const rule = MAGIC_RULES.find((candidate) => candidate.mimeTypes.includes(declaredMimeType));
    if (!rule) return true;

    const signatureMatch = rule.signatures.some((signature) => matchesSignature(data, signature));
    if (!signatureMatch) return false;

    return rule.additionalCheck ? rule.additionalCheck(data) : true;
}
