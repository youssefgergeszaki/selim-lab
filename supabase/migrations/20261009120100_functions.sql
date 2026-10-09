-- SELIM LAB — business functions
-- Critical multi-step operations (order placement, stock reservation, payment application,
-- expiry, cancellation) run inside single PostgreSQL functions so they are atomic.
-- They are callable only by the service role (server-side code), never by browsers.

alter table public.inventory_movements
  add constraint inventory_movements_order_fk
  foreign key (order_id) references public.orders (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Authorization helpers (used by RLS policies)
-- ---------------------------------------------------------------------------
create or replace function public.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = p_role
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role in ('admin', 'staff')
  );
$$;

-- ---------------------------------------------------------------------------
-- New user -> profile
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, preferred_locale)
  values (
    new.id,
    left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
    case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'ar' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Fixed-window rate limiter (shared across serverless instances)
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits as rl (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case
      when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
      else rl.hits + 1
    end,
    window_start = case
      when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
      else rl.window_start
    end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Order placement
-- Prices, shipping and discounts are computed by trusted server code from database
-- records; this function re-verifies them under row locks and reserves stock atomically.
-- Raises exceptions with SL_* messages that the application maps to customer errors.
-- ---------------------------------------------------------------------------
create or replace function public.place_order(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_existing record;
  v_order_id uuid := gen_random_uuid();
  v_item jsonb;
  v_variant record;
  v_qty integer;
  v_unit numeric(12, 2);
  v_line_discount numeric(12, 2);
  v_subtotal numeric(12, 2) := 0;
  v_method public.payment_method := (p ->> 'payment_method')::public.payment_method;
  v_is_cod boolean := (p ->> 'payment_method') = 'cod';
  v_user uuid := nullif(p ->> 'user_id', '')::uuid;
  v_email text := lower(trim(p ->> 'email'));
  v_coupon record;
  v_coupon_id uuid := nullif(p ->> 'coupon_id', '')::uuid;
  v_rate record;
  v_used integer;
  v_minutes integer := coalesce((p ->> 'reservation_minutes')::integer, 30);
begin
  -- Idempotency: the same checkout submission never creates two orders.
  select id, reference into v_existing
  from public.orders where idempotency_key = p ->> 'idempotency_key';
  if found then
    return jsonb_build_object('order_id', v_existing.id, 'reference', v_existing.reference, 'duplicate', true);
  end if;

  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'SL_EMPTY_CART';
  end if;

  -- Shipping rate must be active and serve the governorate.
  select r.id, r.fee, z.governorates into v_rate
  from public.shipping_rates r
  join public.shipping_zones z on z.id = r.zone_id
  where r.id = (p ->> 'shipping_rate_id')::uuid and r.is_active and z.is_active;
  if not found or not ((p ->> 'governorate') = any (v_rate.governorates)) then
    raise exception 'SL_SHIPPING_UNAVAILABLE';
  end if;

  -- Lock variants in a stable order to avoid deadlocks between concurrent checkouts.
  for v_item in
    select value from jsonb_array_elements(p -> 'items') order by value ->> 'variant_id'
  loop
    v_qty := (v_item ->> 'quantity')::integer;
    v_unit := (v_item ->> 'unit_price')::numeric;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'SL_INVALID_QUANTITY';
    end if;

    select pv.* , pr.status as product_status
    into v_variant
    from public.product_variants pv
    join public.products pr on pr.id = pv.product_id
    where pv.id = (v_item ->> 'variant_id')::uuid
    for update of pv;

    if not found or not v_variant.is_active or v_variant.product_status <> 'published' then
      raise exception 'SL_OUT_OF_STOCK' using detail = coalesce(v_item ->> 'variant_id', '');
    end if;
    if v_variant.price <> v_unit then
      raise exception 'SL_PRICE_CHANGED' using detail = v_variant.sku;
    end if;
    if v_variant.stock_quantity - v_variant.reserved_quantity < v_qty then
      raise exception 'SL_OUT_OF_STOCK' using detail = v_variant.sku;
    end if;
    v_subtotal := v_subtotal + v_unit * v_qty;
  end loop;

  if v_subtotal <> (p ->> 'subtotal')::numeric then
    raise exception 'SL_TOTAL_MISMATCH';
  end if;

  -- Coupon usage limits are enforced under a row lock.
  if v_coupon_id is not null then
    select * into v_coupon from public.coupons where id = v_coupon_id for update;
    if not found or not v_coupon.is_active
       or (v_coupon.starts_at is not null and v_coupon.starts_at > now())
       or (v_coupon.ends_at is not null and v_coupon.ends_at <= now()) then
      raise exception 'SL_COUPON_INVALID';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.usage_count >= v_coupon.usage_limit then
      raise exception 'SL_COUPON_EXHAUSTED';
    end if;
    if v_coupon.per_customer_limit is not null then
      select count(*) into v_used
      from public.coupon_redemptions cr
      where cr.coupon_id = v_coupon.id and cr.released_at is null
        and (cr.email = v_email or (v_user is not null and cr.user_id = v_user));
      if v_used >= v_coupon.per_customer_limit then
        raise exception 'SL_COUPON_EXHAUSTED';
      end if;
    end if;
    update public.coupons set usage_count = usage_count + 1 where id = v_coupon.id;
  end if;

  insert into public.orders (
    id, reference, access_token_hash, idempotency_key, user_id, locale, status, payment_status,
    payment_method, email, phone, full_name, governorate, city, address_line, notes,
    shipping_rate_id, shipping_method_name, coupon_id, coupon_code, currency, subtotal,
    discount_total, shipping_fee, cod_fee, total, stock_state, reservation_expires_at
  ) values (
    v_order_id,
    p ->> 'reference',
    p ->> 'access_token_hash',
    p ->> 'idempotency_key',
    v_user,
    coalesce(p ->> 'locale', 'ar'),
    case when v_is_cod then 'confirmed'::public.order_status else 'pending'::public.order_status end,
    case when v_is_cod then 'cod_pending'::public.payment_status else 'pending'::public.payment_status end,
    v_method,
    v_email,
    p ->> 'phone',
    p ->> 'full_name',
    p ->> 'governorate',
    p ->> 'city',
    p ->> 'address_line',
    nullif(p ->> 'notes', ''),
    v_rate.id,
    p ->> 'shipping_method_name',
    v_coupon_id,
    case when v_coupon_id is null then null else p ->> 'coupon_code' end,
    'EGP',
    v_subtotal,
    coalesce((p ->> 'discount_total')::numeric, 0),
    (p ->> 'shipping_fee')::numeric,
    coalesce((p ->> 'cod_fee')::numeric, 0),
    (p ->> 'total')::numeric,
    case when v_is_cod then 'committed' else 'reserved' end,
    case when v_is_cod then null else now() + make_interval(mins => v_minutes) end
  );

  -- Snapshot items and move stock.
  for v_item in select value from jsonb_array_elements(p -> 'items')
  loop
    v_qty := (v_item ->> 'quantity')::integer;
    v_line_discount := coalesce((v_item ->> 'line_discount')::numeric, 0);

    insert into public.order_items (
      order_id, product_id, variant_id, product_name_ar, product_name_en, variant_name_ar,
      variant_name_en, sku, image_path, unit_price, quantity, line_discount, line_total
    )
    select
      v_order_id, pv.product_id, pv.id,
      coalesce(t_ar.name, t_en.name), coalesce(t_en.name, t_ar.name),
      pv.name_ar, pv.name_en, pv.sku,
      (select pi.storage_path from public.product_images pi
        where pi.product_id = pv.product_id order by pi.sort_order, pi.created_at limit 1),
      pv.price, v_qty, v_line_discount, pv.price * v_qty - v_line_discount
    from public.product_variants pv
    left join public.product_translations t_ar on t_ar.product_id = pv.product_id and t_ar.locale = 'ar'
    left join public.product_translations t_en on t_en.product_id = pv.product_id and t_en.locale = 'en'
    where pv.id = (v_item ->> 'variant_id')::uuid;

    if v_is_cod then
      update public.product_variants
        set stock_quantity = stock_quantity - v_qty
        where id = (v_item ->> 'variant_id')::uuid;
      update public.products set sales_count = sales_count + v_qty
        where id = (select product_id from public.product_variants where id = (v_item ->> 'variant_id')::uuid);
      insert into public.inventory_movements (variant_id, type, stock_change, reserved_change, order_id, note)
      values ((v_item ->> 'variant_id')::uuid, 'sale', -v_qty, 0, v_order_id, 'cash on delivery order');
    else
      update public.product_variants
        set reserved_quantity = reserved_quantity + v_qty
        where id = (v_item ->> 'variant_id')::uuid;
      insert into public.inventory_movements (variant_id, type, stock_change, reserved_change, order_id, note)
      values ((v_item ->> 'variant_id')::uuid, 'reservation', 0, v_qty, v_order_id, 'awaiting online payment');
    end if;
  end loop;

  if v_coupon_id is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, email, discount_amount)
    values (v_coupon_id, v_order_id, v_user, v_email, coalesce((p ->> 'discount_total')::numeric, 0));
  end if;

  insert into public.order_status_history (order_id, from_status, to_status, payment_status, note)
  select id, null, status, payment_status, 'order placed' from public.orders where id = v_order_id;

  return jsonb_build_object('order_id', v_order_id, 'reference', p ->> 'reference', 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock helpers
-- ---------------------------------------------------------------------------

-- Converts a reservation (or, after expiry, available stock) into a sale.
-- Returns false when a released order can no longer be fulfilled from stock.
create or replace function public.commit_order_stock(p_order_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_order record;
  v_item record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'SL_ORDER_NOT_FOUND';
  end if;
  if v_order.stock_state = 'committed' then
    return true;
  end if;

  if v_order.stock_state = 'released' then
    -- Reservation expired before payment arrived: only commit if every line is still available.
    for v_item in
      select oi.variant_id, oi.quantity, pv.stock_quantity, pv.reserved_quantity
      from public.order_items oi
      join public.product_variants pv on pv.id = oi.variant_id
      where oi.order_id = p_order_id
      order by oi.variant_id
      for update of pv
    loop
      if v_item.stock_quantity - v_item.reserved_quantity < v_item.quantity then
        return false;
      end if;
    end loop;
    if exists (select 1 from public.order_items where order_id = p_order_id and variant_id is null) then
      return false;
    end if;
  end if;

  for v_item in
    select oi.variant_id, oi.product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id and oi.variant_id is not null
    order by oi.variant_id
  loop
    if v_order.stock_state = 'reserved' then
      update public.product_variants
        set stock_quantity = stock_quantity - v_item.quantity,
            reserved_quantity = reserved_quantity - v_item.quantity
        where id = v_item.variant_id;
      insert into public.inventory_movements (variant_id, type, stock_change, reserved_change, order_id, note)
      values (v_item.variant_id, 'sale', -v_item.quantity, -v_item.quantity, p_order_id, 'payment confirmed');
    else
      update public.product_variants
        set stock_quantity = stock_quantity - v_item.quantity
        where id = v_item.variant_id;
      insert into public.inventory_movements (variant_id, type, stock_change, reserved_change, order_id, note)
      values (v_item.variant_id, 'sale', -v_item.quantity, 0, p_order_id, 'payment confirmed after reservation expiry');
    end if;
    update public.products set sales_count = sales_count + v_item.quantity where id = v_item.product_id;
  end loop;

  update public.orders set stock_state = 'committed', reservation_expires_at = null where id = p_order_id;
  return true;
end;
$$;

-- Releases a reservation, or restocks committed items (cancellation / refund with restock).
create or replace function public.release_order_stock(p_order_id uuid, p_note text default null, p_restock boolean default true)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_order record;
  v_item record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'SL_ORDER_NOT_FOUND';
  end if;
  if v_order.stock_state in ('none', 'released') then
    return;
  end if;
  if v_order.stock_state = 'committed' and not p_restock then
    update public.orders set stock_state = 'released' where id = p_order_id;
    return;
  end if;

  for v_item in
    select oi.variant_id, oi.product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id and oi.variant_id is not null
    order by oi.variant_id
  loop
    if v_order.stock_state = 'reserved' then
      update public.product_variants
        set reserved_quantity = greatest(reserved_quantity - v_item.quantity, 0)
        where id = v_item.variant_id;
      insert into public.inventory_movements (variant_id, type, stock_change, reserved_change, order_id, note)
      values (v_item.variant_id, 'release', 0, -v_item.quantity, p_order_id, coalesce(p_note, 'reservation released'));
    else
      update public.product_variants
        set stock_quantity = stock_quantity + v_item.quantity
        where id = v_item.variant_id;
      update public.products set sales_count = greatest(sales_count - v_item.quantity, 0)
        where id = v_item.product_id;
      insert into public.inventory_movements (variant_id, type, stock_change, reserved_change, order_id, note)
      values (v_item.variant_id, 'return', v_item.quantity, 0, p_order_id, coalesce(p_note, 'order cancelled'));
    end if;
  end loop;

  update public.orders set stock_state = 'released', reservation_expires_at = null where id = p_order_id;

  -- Give back the coupon use.
  update public.coupons c set usage_count = greatest(c.usage_count - 1, 0)
  from public.coupon_redemptions cr
  where cr.order_id = p_order_id and cr.coupon_id = c.id and cr.released_at is null;
  update public.coupon_redemptions set released_at = now()
  where order_id = p_order_id and released_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payment application (idempotent). Called only after the provider notification has
-- been verified (HMAC) and matched to the payment attempt by server code.
-- ---------------------------------------------------------------------------
create or replace function public.apply_payment_result(
  p_payment_id uuid,
  p_transaction_id text,
  p_success boolean,
  p_pending boolean,
  p_amount numeric,
  p_currency text,
  p_failure_reason text default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_payment record;
  v_order record;
  v_committed boolean;
  v_new_status public.order_status;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    return 'payment_not_found';
  end if;
  select * into v_order from public.orders where id = v_payment.order_id for update;

  -- Amount and currency must match the attempt and the order exactly.
  if p_currency is distinct from v_payment.currency
     or p_amount is distinct from v_payment.amount
     or v_payment.amount is distinct from v_order.total then
    update public.orders set needs_attention = true,
      admin_note = concat_ws(E'\n', admin_note, 'Payment amount/currency mismatch on transaction ' || coalesce(p_transaction_id, '?'))
      where id = v_order.id;
    return 'amount_mismatch';
  end if;

  if p_success and not p_pending then
    if v_order.payment_status = 'paid' then
      update public.payments set
        transaction_id = coalesce(transaction_id, p_transaction_id),
        status = 'succeeded'
        where id = v_payment.id and (transaction_id is null or transaction_id = p_transaction_id);
      return 'already_paid';
    end if;
    if v_order.payment_status in ('refunded', 'partially_refunded') then
      return 'ignored';
    end if;

    update public.payments set status = 'succeeded', transaction_id = p_transaction_id, failure_reason = null
      where id = v_payment.id;

    v_committed := public.commit_order_stock(v_order.id);
    v_new_status := case when v_committed then 'confirmed'::public.order_status else 'on_hold'::public.order_status end;

    update public.orders set
      payment_status = 'paid',
      paid_at = now(),
      status = v_new_status,
      cancelled_at = case when v_committed then null else cancelled_at end,
      cancel_reason = case when v_committed then null else cancel_reason end,
      needs_attention = needs_attention or not v_committed,
      admin_note = case when v_committed then admin_note
        else concat_ws(E'\n', admin_note, 'Paid after reservation expired and stock is insufficient — refund or restock required.') end
      where id = v_order.id;

    insert into public.order_status_history (order_id, from_status, to_status, payment_status, note)
    values (v_order.id, v_order.status, v_new_status, 'paid', 'payment confirmed: ' || coalesce(p_transaction_id, ''));
    return case when v_committed then 'paid' else 'paid_on_hold' end;
  end if;

  if p_pending then
    update public.payments set status = 'pending', transaction_id = coalesce(transaction_id, p_transaction_id)
      where id = v_payment.id and status in ('initiated', 'pending');
    return 'pending';
  end if;

  -- Failed / declined transaction.
  update public.payments set status = 'failed', failure_reason = left(p_failure_reason, 300),
      transaction_id = coalesce(transaction_id, p_transaction_id)
    where id = v_payment.id and status <> 'succeeded';
  if v_order.payment_status = 'paid' then
    return 'ignored_after_paid';
  end if;
  if v_order.payment_status in ('pending', 'failed') then
    update public.orders set payment_status = 'failed' where id = v_order.id;
    insert into public.order_status_history (order_id, from_status, to_status, payment_status, note)
    values (v_order.id, v_order.status, v_order.status, 'failed', 'payment failed');
  end if;
  return 'failed';
end;
$$;

-- ---------------------------------------------------------------------------
-- Expire unpaid online orders and release their reservations.
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_orders()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_order record;
  v_count integer := 0;
begin
  for v_order in
    select id, status from public.orders
    where stock_state = 'reserved'
      and reservation_expires_at < now()
      and payment_status in ('pending', 'failed')
    order by reservation_expires_at
    for update skip locked
  loop
    perform public.release_order_stock(v_order.id, 'payment window expired', true);
    update public.orders set
      status = 'cancelled', payment_status = 'expired', cancelled_at = now(), cancel_reason = 'payment_timeout'
      where id = v_order.id;
    update public.payments set status = 'failed', failure_reason = coalesce(failure_reason, 'expired')
      where order_id = v_order.id and status in ('initiated', 'pending');
    insert into public.order_status_history (order_id, from_status, to_status, payment_status, note)
    values (v_order.id, v_order.status, 'cancelled', 'expired', 'payment window expired');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin operations (invoked by server actions after server-side role checks)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_order_status(
  p_order_id uuid, p_status public.order_status, p_actor uuid, p_note text default null, p_restock boolean default true
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_order record;
  v_allowed boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'SL_ORDER_NOT_FOUND';
  end if;
  if v_order.status = p_status then
    return;
  end if;

  v_allowed := case v_order.status
    when 'pending' then p_status in ('confirmed', 'cancelled', 'on_hold')
    when 'confirmed' then p_status in ('processing', 'shipped', 'cancelled', 'on_hold')
    when 'processing' then p_status in ('shipped', 'cancelled', 'on_hold')
    when 'shipped' then p_status in ('delivered', 'on_hold')
    when 'on_hold' then p_status in ('confirmed', 'processing', 'cancelled')
    when 'delivered' then false
    when 'cancelled' then false
  end;
  if not v_allowed then
    raise exception 'SL_INVALID_TRANSITION';
  end if;
  -- An online order can only be confirmed manually once it is paid.
  if p_status = 'confirmed' and v_order.payment_method <> 'cod' and v_order.payment_status <> 'paid' then
    raise exception 'SL_NOT_PAID';
  end if;

  if p_status = 'cancelled' then
    perform public.release_order_stock(p_order_id, coalesce(p_note, 'cancelled by staff'), p_restock);
    update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = coalesce(p_note, 'cancelled by staff'),
      payment_status = case when payment_status in ('pending', 'failed', 'cod_pending') then 'cancelled' else payment_status end
      where id = p_order_id;
  else
    update public.orders set status = p_status where id = p_order_id;
  end if;

  insert into public.order_status_history (order_id, from_status, to_status, payment_status, note, actor_id)
  select id, v_order.status, status, payment_status, p_note, p_actor from public.orders where id = p_order_id;
end;
$$;

create or replace function public.admin_set_payment_status(
  p_order_id uuid, p_payment_status public.payment_status, p_actor uuid, p_note text default null, p_restock boolean default false
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_order record;
  v_allowed boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'SL_ORDER_NOT_FOUND';
  end if;
  if v_order.payment_status = p_payment_status then
    return;
  end if;
  -- Online payments are marked paid only by verified gateway notifications.
  v_allowed := case
    when v_order.payment_status = 'cod_pending' and p_payment_status = 'paid' then true
    when v_order.payment_status = 'paid' and p_payment_status in ('refunded', 'partially_refunded') then true
    when v_order.payment_status = 'partially_refunded' and p_payment_status = 'refunded' then true
    else false
  end;
  if not v_allowed then
    raise exception 'SL_INVALID_TRANSITION';
  end if;

  update public.orders set
    payment_status = p_payment_status,
    paid_at = case when p_payment_status = 'paid' then now() else paid_at end
    where id = p_order_id;

  if p_payment_status = 'refunded' and p_restock then
    perform public.release_order_stock(p_order_id, coalesce(p_note, 'refunded'), true);
  end if;

  insert into public.order_status_history (order_id, from_status, to_status, payment_status, note, actor_id)
  values (p_order_id, v_order.status, v_order.status, p_payment_status, p_note, p_actor);
end;
$$;

create or replace function public.admin_adjust_stock(
  p_variant_id uuid, p_delta integer, p_actor uuid, p_note text default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_variant record;
begin
  select * into v_variant from public.product_variants where id = p_variant_id for update;
  if not found then
    raise exception 'SL_VARIANT_NOT_FOUND';
  end if;
  if v_variant.stock_quantity + p_delta < v_variant.reserved_quantity then
    raise exception 'SL_STOCK_BELOW_RESERVED';
  end if;
  update public.product_variants set stock_quantity = stock_quantity + p_delta where id = p_variant_id;
  insert into public.inventory_movements (variant_id, type, stock_change, reserved_change, note, actor_id)
  values (p_variant_id, case when p_delta >= 0 then 'restock'::public.inventory_movement_type else 'adjustment'::public.inventory_movement_type end,
          p_delta, 0, p_note, p_actor);
  return v_variant.stock_quantity + p_delta;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execution privileges: business functions are server-only.
-- ---------------------------------------------------------------------------
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.place_order(jsonb) from public, anon, authenticated;
revoke execute on function public.commit_order_stock(uuid) from public, anon, authenticated;
revoke execute on function public.release_order_stock(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.apply_payment_result(uuid, text, boolean, boolean, numeric, text, text) from public, anon, authenticated;
revoke execute on function public.expire_stale_orders() from public, anon, authenticated;
revoke execute on function public.admin_set_order_status(uuid, public.order_status, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.admin_set_payment_status(uuid, public.payment_status, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.admin_adjust_stock(uuid, integer, uuid, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.place_order(jsonb) to service_role;
grant execute on function public.commit_order_stock(uuid) to service_role;
grant execute on function public.release_order_stock(uuid, text, boolean) to service_role;
grant execute on function public.apply_payment_result(uuid, text, boolean, boolean, numeric, text, text) to service_role;
grant execute on function public.expire_stale_orders() to service_role;
grant execute on function public.admin_set_order_status(uuid, public.order_status, uuid, text, boolean) to service_role;
grant execute on function public.admin_set_payment_status(uuid, public.payment_status, uuid, text, boolean) to service_role;
grant execute on function public.admin_adjust_stock(uuid, integer, uuid, text) to service_role;
grant execute on function public.has_role(public.app_role) to anon, authenticated, service_role;
grant execute on function public.is_staff() to anon, authenticated, service_role;
