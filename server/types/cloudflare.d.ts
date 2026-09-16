// Cloudflare Workers types for Nuxt
/// <reference types="@cloudflare/workers-types" />

declare module "nitropack" {
  interface NitroRuntimeConfig {
    cloudflare?: {
      bindings?: {
        CEREMLY_R2?: R2Bucket;
        IMAGES?: CFImages;
      };
    };
  }
}

interface CFImages {
  input(input: ArrayBuffer | ReadableStream | FormData, options?: { rules?: string[] }): Promise<ReadableStream>;
}
