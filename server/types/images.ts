/**
 * Minimal shape of the Cloudflare Images binding used by the media bridge.
 *
 * A module (not an ambient declaration) so both `server/types/cloudflare.d.ts`
 * and the bridge helpers can import the same types: the ambient form was visible
 * in one tsconfig project and not the other, which failed the server typecheck.
 *
 * `@cloudflare/workers-types` does not ship these, and pinning the three methods
 * the bridge actually calls keeps the surface honest.
 */
export interface ImagesBinding {
    input(input: ReadableStream | ArrayBuffer | Uint8Array): ImagesTransformer;
}

export interface ImagesTransformer {
    transform(options: {
        width?: number;
        height?: number;
        fit?: "scale-down" | "contain" | "cover" | "crop" | "pad";
    }): ImagesTransformer;
    output(options?: {
        format?: "image/webp" | "image/jpeg" | "image/png" | "image/avif" | "rgb" | "rgba";
        quality?: number;
    }): ImagesOutput;
}

export interface ImagesOutput {
    response(): Response;
    contentType(): Promise<string>;
}
