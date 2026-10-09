import { randomUUID } from "node:crypto";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const SIGNATURES: { mime: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    ext: "png",
    test: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  },
  {
    mime: "image/webp",
    ext: "webp",
    test: (b) =>
      String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
  {
    mime: "image/avif",
    ext: "avif",
    test: (b) => String.fromCharCode(...b.slice(4, 8)) === "ftyp" && /avi[fs]/.test(String.fromCharCode(...b.slice(8, 12))),
  },
];

export type UploadCheck =
  | { ok: true; mime: string; ext: string; bytes: Uint8Array }
  | { ok: false; reason: "missing" | "too_large" | "unsupported_type" | "signature_mismatch" };

/**
 * Validates an uploaded image by size, declared MIME type AND file signature (magic bytes),
 * so a renamed executable or HTML file can never be stored as an "image". SVG is rejected
 * because it can carry scripts.
 */
export async function validateImageUpload(file: File | null | undefined): Promise<UploadCheck> {
  if (!file || typeof file === "string" || file.size === 0) return { ok: false, reason: "missing" };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };
  const declared = SIGNATURES.find((s) => s.mime === file.type);
  if (!declared) return { ok: false, reason: "unsupported_type" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!declared.test(bytes)) return { ok: false, reason: "signature_mismatch" };
  return { ok: true, mime: declared.mime, ext: declared.ext, bytes };
}

/** Random, non-guessable storage path; user-supplied file names are never used. */
export function storagePathFor(prefix: string, ext: string): string {
  const safePrefix = prefix.replace(/[^a-z0-9/-]/gi, "").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  return `${safePrefix}/${randomUUID()}.${ext}`;
}
