export type Bucket = "product-images" | "site-media";

/** Public URL for an object in a public Supabase Storage bucket. */
export function storageUrl(bucket: Bucket, path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${encoded}`;
}
