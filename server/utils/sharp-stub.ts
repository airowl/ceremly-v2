/**
 * Sharp stub for Cloudflare Workers build.
 * Sharp is not available in the Workers runtime; image processing
 * is handled by Cloudflare Images binding (Task 7).
 * This stub satisfies TypeScript imports but throws at runtime if called.
 * Only used when NUXT_NITRO_PRESET=cloudflare.
 */

export interface Sharp {
  (input: Buffer | Uint8Array | string): SharpInstance;
  (input: Buffer | Uint8Array | string, options: SharpOptions): SharpInstance;
}

export interface SharpOptions {
  failOnError?: boolean;
  limitInputPixels?: number;
  sequentialRead?: boolean;
  density?: number;
  pages?: number;
  page?: number;
  raw?: RawOptions;
}

export interface RawOptions {
  width: number;
  height: number;
  channels: number;
}

export interface SharpInstance {
  resize(width: number, height?: number, options?: ResizeOptions): SharpInstance;
  webp(options?: WebpOptions): SharpInstance;
  toBuffer(): Promise<Buffer>;
  metadata(): Promise<Metadata>;
}

export interface ResizeOptions {
  withoutEnlargement?: boolean;
  fit?: string;
  position?: string;
  background?: string | { r: number; g: number; b: number; alpha?: number };
  kernel?: string;
  fastShrinkOnLoad?: boolean;
}

export interface WebpOptions {
  quality?: number;
  alphaQuality?: number;
  lossless?: boolean;
  nearLossless?: boolean;
  smartSubsample?: boolean;
  effort?: number;
  minSize?: boolean;
}

export interface Metadata {
  format?: string;
  width?: number;
  height?: number;
  channels?: number;
  space?: string;
  density?: number;
  hasProfile?: boolean;
  hasAlpha?: boolean;
  orientation?: number;
  exif?: Record<string, unknown>;
  icc?: Buffer;
}

function notAvailable(): never {
  throw new Error('Sharp is not available on Cloudflare Workers. Image processing is handled by Cloudflare Images binding (see Task 7).');
}

const sharp: Sharp = Object.assign(
  (input: Buffer | Uint8Array | string, options?: SharpOptions) => {
    notAvailable();
  },
  {
    default: notAvailable,
    __esModule: true,
  }
);

export default sharp;