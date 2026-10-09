-- SELIM LAB — core schema
-- Monetary values: numeric(12,2) in EGP. Currency is stored explicitly on orders and payments.
-- All timestamps are timestamptz.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'staff');
create type public.category_kind as enum ('category', 'collection');
create type public.product_status as enum ('draft', 'published', 'archived');
create type public.order_status as enum (
  'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'on_hold'
);
create type public.payment_status as enum (
  'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded', 'partially_refunded', 'cod_pending'
);
create type public.payment_method as enum ('paymob_card', 'paymob_wallet', 'cod');
create type public.payment_attempt_status as enum (
  'initiated', 'pending', 'succeeded', 'failed', 'voided', 'refunded'
);
create type public.inventory_movement_type as enum (
  'adjustment', 'reservation', 'release', 'sale', 'return', 'restock'
);
create type public.review_status as enum ('pending', 'approved', 'rejected');
create type public.discount_type as enum ('percentage', 'fixed', 'free_shipping');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles & roles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  phone text check (char_length(phone) <= 20),
  preferred_locale text not null default 'ar' check (preferred_locale in ('ar', 'en')),
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Role assignments are only writable with the service role (server-side, audited).
create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text check (char_length(label) <= 60),
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text not null check (phone ~ '^01[0125][0-9]{8}$'),
  governorate text not null check (char_length(governorate) <= 40),
  city text not null check (char_length(city) between 2 and 80),
  address_line text not null check (char_length(address_line) between 5 and 300),
  notes text check (char_length(notes) <= 300),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);
create unique index addresses_one_default_per_user on public.addresses (user_id) where is_default;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  kind public.category_kind not null default 'category',
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_ar text not null check (char_length(name_ar) between 1 and 120),
  name_en text not null check (char_length(name_en) between 1 and 120),
  description_ar text,
  description_en text,
  image_path text,
  parent_id uuid references public.categories (id) on delete set null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index categories_kind_visible_idx on public.categories (kind, is_visible, sort_order);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  status public.product_status not null default 'draft',
  is_featured boolean not null default false,
  sales_count integer not null default 0 check (sales_count >= 0),
  sort_order integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_status_idx on public.products (status, is_featured, sort_order);
create index products_sales_idx on public.products (sales_count desc) where status = 'published';

-- Localized product content (one row per locale).
create table public.product_translations (
  product_id uuid not null references public.products (id) on delete cascade,
  locale text not null check (locale in ('ar', 'en')),
  name text not null check (char_length(name) between 1 and 200),
  slug text not null check (char_length(slug) between 1 and 200 and slug !~ '[/?#\s]'),
  short_description text check (char_length(short_description) <= 500),
  description text,
  ingredients text,
  how_to_use text,
  warnings text,
  attributes jsonb not null default '[]'::jsonb check (jsonb_typeof(attributes) = 'array'),
  seo_title text check (char_length(seo_title) <= 120),
  seo_description text check (char_length(seo_description) <= 320),
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(short_description, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, locale),
  unique (locale, slug)
);
create index product_translations_search_idx on public.product_translations using gin (search_vector);

create table public.product_categories (
  product_id uuid not null references public.products (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (product_id, category_id)
);
create index product_categories_category_idx on public.product_categories (category_id);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null,
  alt_ar text check (char_length(alt_ar) <= 200),
  alt_en text check (char_length(alt_en) <= 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null unique check (sku ~ '^[A-Z0-9][A-Z0-9-]{1,40}$'),
  name_ar text,
  name_en text,
  price numeric(12, 2) not null check (price >= 0),
  -- When set and greater than price, the product is shown "on sale".
  compare_at_price numeric(12, 2) check (compare_at_price is null or compare_at_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  weight_grams integer check (weight_grams is null or weight_grams >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reserved_not_above_stock check (reserved_quantity <= stock_quantity)
);
create index product_variants_product_idx on public.product_variants (product_id, sort_order);
create unique index product_variants_one_default on public.product_variants (product_id) where is_default;

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  type public.inventory_movement_type not null,
  stock_change integer not null default 0,
  reserved_change integer not null default 0,
  order_id uuid,
  note text check (char_length(note) <= 300),
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_movements_variant_idx on public.inventory_movements (variant_id, created_at desc);
create index inventory_movements_order_idx on public.inventory_movements (order_id);

-- ---------------------------------------------------------------------------
-- Carts (guest carts identified by a hashed httpOnly cookie token; user carts by user_id)
-- ---------------------------------------------------------------------------
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique,
  user_id uuid unique references auth.users (id) on delete cascade,
  coupon_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_has_owner check (token_hash is not null or user_id is not null)
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity integer not null check (quantity between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);

-- ---------------------------------------------------------------------------
-- Shipping
-- ---------------------------------------------------------------------------
create table public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null,
  -- Governorate codes, see src/lib/governorates.ts
  governorates text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipping_zones_governorates_idx on public.shipping_zones using gin (governorates);

create table public.shipping_rates (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.shipping_zones (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  fee numeric(12, 2) not null check (fee >= 0),
  min_subtotal numeric(12, 2) not null default 0 check (min_subtotal >= 0),
  max_subtotal numeric(12, 2) check (max_subtotal is null or max_subtotal >= min_subtotal),
  free_shipping_threshold numeric(12, 2) check (free_shipping_threshold is null or free_shipping_threshold >= 0),
  eta_min_days integer check (eta_min_days is null or eta_min_days >= 0),
  eta_max_days integer check (eta_max_days is null or eta_max_days >= coalesce(eta_min_days, 0)),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipping_rates_zone_idx on public.shipping_rates (zone_id, is_active, sort_order);

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description text,
  discount_type public.discount_type not null,
  value numeric(12, 2) not null default 0 check (value >= 0),
  min_subtotal numeric(12, 2) not null default 0 check (min_subtotal >= 0),
  max_discount numeric(12, 2) check (max_discount is null or max_discount >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint percentage_range check (discount_type <> 'percentage' or value <= 100),
  constraint coupon_window check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^SL-[0-9]{6}-[A-Z0-9]{6}$'),
  -- sha256 of the random guest access token; the token itself is never stored.
  access_token_hash text not null,
  idempotency_key text unique check (char_length(idempotency_key) between 16 and 100),
  user_id uuid references auth.users (id) on delete set null,
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'pending',
  payment_method public.payment_method not null,
  email text not null check (char_length(email) <= 254),
  phone text not null check (phone ~ '^01[0125][0-9]{8}$'),
  full_name text not null check (char_length(full_name) between 2 and 120),
  governorate text not null,
  city text not null,
  address_line text not null,
  notes text,
  shipping_rate_id uuid references public.shipping_rates (id) on delete set null,
  shipping_method_name text,
  coupon_id uuid references public.coupons (id) on delete set null,
  coupon_code text,
  currency char(3) not null default 'EGP' check (currency = 'EGP'),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  discount_total numeric(12, 2) not null default 0 check (discount_total >= 0),
  shipping_fee numeric(12, 2) not null default 0 check (shipping_fee >= 0),
  cod_fee numeric(12, 2) not null default 0 check (cod_fee >= 0),
  total numeric(12, 2) not null check (total >= 0),
  stock_state text not null default 'none' check (stock_state in ('none', 'reserved', 'committed', 'released')),
  reservation_expires_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  admin_note text,
  needs_attention boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint total_matches check (total = subtotal - discount_total + shipping_fee + cod_fee)
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_payment_status_idx on public.orders (payment_status, created_at desc);
create index orders_reservation_idx on public.orders (reservation_expires_at)
  where stock_state = 'reserved';

-- Snapshot of purchased items. Historical orders never change when products are edited.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name_ar text not null,
  product_name_en text not null,
  variant_name_ar text,
  variant_name_en text,
  sku text not null,
  image_path text,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_discount numeric(12, 2) not null default 0 check (line_discount >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  payment_status public.payment_status,
  note text,
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  discount_amount numeric(12, 2) not null check (discount_amount >= 0),
  released_at timestamptz,
  created_at timestamptz not null default now()
);
create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id, email);

-- ---------------------------------------------------------------------------
-- Payments (no card data is ever stored)
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null default 'paymob' check (provider in ('paymob', 'cod')),
  method public.payment_method not null,
  attempt integer not null default 1 check (attempt > 0),
  status public.payment_attempt_status not null default 'initiated',
  amount numeric(12, 2) not null check (amount >= 0),
  currency char(3) not null default 'EGP',
  special_reference text unique,
  intention_id text unique,
  client_secret text,
  provider_order_id text unique,
  transaction_id text unique,
  integration_id text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, attempt)
);
create index payments_order_idx on public.payments (order_id);

-- Every provider notification is recorded once (idempotency key) with a sanitised payload.
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null default 'paymob',
  event_key text not null,
  source text not null check (source in ('webhook', 'redirect', 'inquiry', 'system')),
  order_id uuid references public.orders (id) on delete set null,
  payment_id uuid references public.payments (id) on delete set null,
  transaction_id text,
  hmac_valid boolean,
  outcome text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, event_key)
);
create index payment_events_order_idx on public.payment_events (order_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  rating smallint not null check (rating between 1 and 5),
  title text check (char_length(title) <= 120),
  body text not null check (char_length(body) between 3 and 2000),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  status public.review_status not null default 'pending',
  verified_purchase boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index reviews_product_status_idx on public.reviews (product_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Content & settings
-- ---------------------------------------------------------------------------
create table public.store_settings (
  id smallint primary key default 1 check (id = 1),
  contact_email text,
  contact_phone text,
  whatsapp text,
  address_ar text,
  address_en text,
  social jsonb not null default '{}'::jsonb,
  announcement_ar text,
  announcement_en text,
  announcement_active boolean not null default false,
  cod_enabled boolean not null default false,
  cod_fee numeric(12, 2) not null default 0 check (cod_fee >= 0),
  cod_max_total numeric(12, 2) check (cod_max_total is null or cod_max_total > 0),
  paymob_card_enabled boolean not null default false,
  paymob_wallet_enabled boolean not null default false,
  reservation_minutes integer not null default 30 check (reservation_minutes between 10 and 1440),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  updated_at timestamptz not null default now()
);
insert into public.store_settings (id) values (1) on conflict do nothing;

create table public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]{2,40}$'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  -- { "ar": { "eyebrow", "title", "body", "cta_label", "cta_href" }, "en": { ... } }
  content jsonb not null default '{"ar":{},"en":{}}'::jsonb,
  image_path text,
  updated_at timestamptz not null default now()
);

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  question_ar text not null,
  question_en text not null,
  answer_ar text not null,
  answer_en text not null,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  image_path text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title_ar text not null,
  title_en text not null,
  body_ar text not null default '',
  body_en text not null default '',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) <= 254),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  status text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed')),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'addresses', 'categories', 'products', 'product_translations', 'product_variants',
    'carts', 'cart_items', 'shipping_zones', 'shipping_rates', 'coupons', 'orders', 'payments',
    'reviews', 'store_settings', 'homepage_sections', 'faqs', 'ingredients', 'content_pages',
    'newsletter_subscribers'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;
