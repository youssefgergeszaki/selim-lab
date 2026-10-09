-- SELIM LAB — Storage buckets
-- Public-read buckets for catalogue and site imagery. Objects are served through the
-- public URL endpoint; no listing policy is granted. Uploads happen only from server
-- actions with the service role after validating the admin session, MIME type, size
-- and file signature.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('site-media', 'site-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
