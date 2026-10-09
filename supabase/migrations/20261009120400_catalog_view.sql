-- SELIM LAB — storefront listing view
-- security_invoker = true: the view runs with the caller's privileges, so the RLS policies
-- of the underlying tables apply (anon sees only published, active data).

-- Normalises Arabic text for forgiving search: أ إ آ ٱ -> ا, ة -> ه, ى -> ي, and strips diacritics
-- (U+064B–U+065F, U+0670). Code points are spelled with chr() to avoid bidi ambiguity.
create or replace function public.normalize_search(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(
    regexp_replace(
      translate(coalesce(p_text, ''), chr(1571)||chr(1573)||chr(1570)||chr(1649)||chr(1577)||chr(1609), chr(1575)||chr(1575)||chr(1575)||chr(1575)||chr(1607)||chr(1610)),
      '['||chr(1611)||'-'||chr(1631)||chr(1648)||']', '', 'g'
    )
  );
$$;

create view public.product_listing
with (security_invoker = true)
as
select
  p.id as product_id,
  t.locale,
  t.name,
  t.slug,
  t.short_description,
  p.is_featured,
  p.sales_count,
  p.sort_order,
  p.published_at,
  p.created_at,
  v.min_price,
  v.compare_at_price,
  v.available_quantity,
  v.variant_count,
  v.default_variant_id,
  img.storage_path as image_path,
  img.alt_ar as image_alt_ar,
  img.alt_en as image_alt_en,
  coalesce(cats.category_ids, '{}'::uuid[]) as category_ids,
  public.normalize_search(t.name || ' ' || coalesce(t.short_description, '')) as search_text
from public.products p
join public.product_translations t on t.product_id = p.id
join lateral (
  select
    min(pv.price) as min_price,
    (array_agg(pv.compare_at_price order by pv.price, pv.sort_order))[1] as compare_at_price,
    sum(greatest(pv.stock_quantity - pv.reserved_quantity, 0))::integer as available_quantity,
    count(*)::integer as variant_count,
    (array_agg(pv.id order by pv.is_default desc, pv.sort_order, pv.created_at))[1] as default_variant_id
  from public.product_variants pv
  where pv.product_id = p.id and pv.is_active
) v on true
left join lateral (
  select pi.storage_path, pi.alt_ar, pi.alt_en
  from public.product_images pi
  where pi.product_id = p.id
  order by pi.sort_order, pi.created_at
  limit 1
) img on true
left join lateral (
  select array_agg(pc.category_id) as category_ids
  from public.product_categories pc
  where pc.product_id = p.id
) cats on true
where p.status = 'published' and v.variant_count > 0;

grant select on public.product_listing to anon, authenticated, service_role;
