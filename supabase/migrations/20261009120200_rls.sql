-- SELIM LAB — Row Level Security
-- Principle: browsers (anon / authenticated keys) can only READ public content and the
-- signed-in customer's own records. Every write goes through server code that verifies
-- authorization and uses the service role, which bypasses RLS.

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.addresses enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_translations enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.shipping_zones enable row level security;
alter table public.shipping_rates enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.reviews enable row level security;
alter table public.store_settings enable row level security;
alter table public.homepage_sections enable row level security;
alter table public.faqs enable row level security;
alter table public.ingredients enable row level security;
alter table public.content_pages enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limits enable row level security;

-- Profiles ------------------------------------------------------------------
create policy "profiles: owner reads" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_staff()));
create policy "profiles: owner updates" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Roles: readable by the user themselves and admins; never writable from the browser.
create policy "user_roles: self or admin reads" on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()) or (select public.has_role('admin')));

-- Addresses -----------------------------------------------------------------
create policy "addresses: owner reads" on public.addresses
  for select to authenticated using (user_id = (select auth.uid()));
create policy "addresses: owner inserts" on public.addresses
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "addresses: owner updates" on public.addresses
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "addresses: owner deletes" on public.addresses
  for delete to authenticated using (user_id = (select auth.uid()));

-- Catalog -------------------------------------------------------------------
create policy "categories: public reads visible" on public.categories
  for select to anon, authenticated using (is_visible or (select public.is_staff()));

create policy "products: public reads published" on public.products
  for select to anon, authenticated using (status = 'published' or (select public.is_staff()));

create policy "product_translations: public reads published" on public.product_translations
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.status = 'published')
    or (select public.is_staff())
  );

create policy "product_categories: public reads published" on public.product_categories
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.status = 'published')
    or (select public.is_staff())
  );

create policy "product_images: public reads published" on public.product_images
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.status = 'published')
    or (select public.is_staff())
  );

create policy "product_variants: public reads active" on public.product_variants
  for select to anon, authenticated using (
    (is_active and exists (select 1 from public.products p where p.id = product_id and p.status = 'published'))
    or (select public.is_staff())
  );

create policy "inventory_movements: staff reads" on public.inventory_movements
  for select to authenticated using ((select public.is_staff()));

-- Carts (guest carts are only reachable server-side through the hashed cookie token)
create policy "carts: owner reads" on public.carts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "cart_items: owner reads" on public.cart_items
  for select to authenticated using (
    exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid()))
  );

-- Shipping ------------------------------------------------------------------
create policy "shipping_zones: public reads active" on public.shipping_zones
  for select to anon, authenticated using (is_active or (select public.is_staff()));
create policy "shipping_rates: public reads active" on public.shipping_rates
  for select to anon, authenticated using (is_active or (select public.is_staff()));

-- Coupons are never listed publicly; validation happens server-side.
create policy "coupons: staff reads" on public.coupons
  for select to authenticated using ((select public.is_staff()));
create policy "coupon_redemptions: staff reads" on public.coupon_redemptions
  for select to authenticated using ((select public.is_staff()));

-- Orders --------------------------------------------------------------------
create policy "orders: owner or staff reads" on public.orders
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy "order_items: owner or staff reads" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
    or (select public.is_staff())
  );
create policy "order_status_history: owner or staff reads" on public.order_status_history
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
    or (select public.is_staff())
  );

-- Payments are sensitive: staff only.
create policy "payments: staff reads" on public.payments
  for select to authenticated using ((select public.is_staff()));
create policy "payment_events: admin reads" on public.payment_events
  for select to authenticated using ((select public.has_role('admin')));

-- Reviews -------------------------------------------------------------------
create policy "reviews: public reads approved" on public.reviews
  for select to anon, authenticated using (
    status = 'approved' or user_id = (select auth.uid()) or (select public.is_staff())
  );

-- Content -------------------------------------------------------------------
create policy "store_settings: public reads" on public.store_settings
  for select to anon, authenticated using (true);
create policy "homepage_sections: public reads active" on public.homepage_sections
  for select to anon, authenticated using (is_active or (select public.is_staff()));
create policy "faqs: public reads published" on public.faqs
  for select to anon, authenticated using (is_published or (select public.is_staff()));
create policy "ingredients: public reads published" on public.ingredients
  for select to anon, authenticated using (is_published or (select public.is_staff()));
create policy "content_pages: public reads published" on public.content_pages
  for select to anon, authenticated using (is_published or (select public.is_staff()));

-- Protected data ------------------------------------------------------------
create policy "newsletter: admin reads" on public.newsletter_subscribers
  for select to authenticated using ((select public.has_role('admin')));
create policy "audit_logs: admin reads" on public.audit_logs
  for select to authenticated using ((select public.has_role('admin')));
-- rate_limits: no policies (service role only).
