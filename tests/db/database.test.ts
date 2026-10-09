import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, createTestDatabase, createUser, DEV, orderPayload, TEST_DATABASE_URL, type TestDb } from "./helpers";

/**
 * Integration tests for the schema, RLS policies and transactional order/payment functions.
 * Skipped unless TEST_DATABASE_URL points at a PostgreSQL 15+ server.
 */
describe.skipIf(!TEST_DATABASE_URL)("database: RLS and business functions", () => {
  let db: TestDb;
  let cairoRate: string;
  let customerA: string;
  let customerB: string;

  async function placeOrder(over: Record<string, unknown> = {}, items = [{ variant_id: DEV.serumVariant, quantity: 1, unit_price: "520.00" }]) {
    const subtotal = items.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
    const shipping = 60;
    const payload = orderPayload({
      shipping_rate_id: cairoRate,
      shipping_fee: shipping.toFixed(2),
      subtotal: subtotal.toFixed(2),
      total: (subtotal + shipping - Number(over.discount_total ?? 0) + Number(over.cod_fee ?? 0)).toFixed(2),
      items,
      ...over,
    });
    const { rows } = await db.pool.query("select public.place_order($1::jsonb) as r", [JSON.stringify(payload)]);
    return rows[0].r as { order_id: string; reference: string; duplicate: boolean };
  }

  async function variant(id: string) {
    const { rows } = await db.pool.query("select stock_quantity, reserved_quantity from product_variants where id = $1", [id]);
    return rows[0] as { stock_quantity: number; reserved_quantity: number };
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    const { rows } = await db.pool.query(
      "select r.id from shipping_rates r join shipping_zones z on z.id = r.zone_id where 'cairo' = any(z.governorates) limit 1",
    );
    cairoRate = rows[0].id;
    customerA = await createUser(db.pool, "a@example.com");
    customerB = await createUser(db.pool, "b@example.com");
  });

  afterAll(async () => {
    await db?.drop();
  });

  // -------------------------------------------------------------------------
  describe("row level security", () => {
    it("lets visitors read only published catalogue data", async () => {
      await db.pool.query("update products set status = 'draft' where id = '00000000-0000-4000-8000-000000001004'");
      const names = await asRole(db.pool, "anon", null, async (c) => (await c.query("select name from product_listing where locale = 'en'")).rows.map((r) => r.name));
      expect(names).not.toContain("[DEV] Sunscreen");
      expect(names).toContain("[DEV] Serum");
      const hidden = await asRole(db.pool, "anon", null, async (c) =>
        (await c.query("select count(*)::int as n from product_variants where product_id = '00000000-0000-4000-8000-000000001004'")).rows[0].n,
      );
      expect(hidden).toBe(0);
      await db.pool.query("update products set status = 'published' where id = '00000000-0000-4000-8000-000000001004'");
    });

    it("hides coupons, orders, payments, newsletter, audit logs and carts from visitors", async () => {
      await db.pool.query("insert into newsletter_subscribers (email) values ('n@example.com')");
      for (const table of ["coupons", "orders", "payments", "payment_events", "newsletter_subscribers", "audit_logs", "carts", "user_roles", "rate_limits"]) {
        const n = await asRole(db.pool, "anon", null, async (c) => (await c.query(`select count(*)::int as n from ${table}`)).rows[0].n);
        expect(n, table).toBe(0);
      }
    });

    it("blocks writes to catalogue and content from the browser roles", async () => {
      await expect(
        asRole(db.pool, "authenticated", customerA, (c) => c.query("update product_variants set price = 1")),
      ).resolves.toMatchObject({ rowCount: 0 });
      await expect(
        asRole(db.pool, "anon", null, (c) => c.query("insert into products (status) values ('published')")),
      ).rejects.toThrow(/row-level security/);
    });

    it("prevents customers from granting themselves roles", async () => {
      await expect(
        asRole(db.pool, "authenticated", customerA, (c) => c.query("insert into user_roles (user_id, role) values ($1, 'admin')", [customerA])),
      ).rejects.toThrow(/row-level security/);
    });

    it("lets customers read only their own orders and never change payment status", async () => {
      const mine = await placeOrder({ user_id: customerA });
      const theirs = await placeOrder({ user_id: customerB });
      const visible = await asRole(db.pool, "authenticated", customerA, async (c) => (await c.query("select id from orders")).rows.map((r) => r.id));
      expect(visible).toContain(mine.order_id);
      expect(visible).not.toContain(theirs.order_id);
      const items = await asRole(db.pool, "authenticated", customerA, async (c) =>
        (await c.query("select count(*)::int as n from order_items where order_id = $1", [theirs.order_id])).rows[0].n,
      );
      expect(items).toBe(0);
      const updated = await asRole(db.pool, "authenticated", customerA, (c) =>
        c.query("update orders set payment_status = 'paid' where id = $1", [mine.order_id]),
      );
      expect(updated.rowCount).toBe(0);
    });

    it("keeps addresses private to their owner", async () => {
      await asRole(db.pool, "authenticated", customerA, async (c) => {
        await c.query(
          "insert into addresses (user_id, full_name, phone, governorate, city, address_line) values ($1, 'Aa', '01012345678', 'cairo', 'Nasr', '1 Street name')",
          [customerA],
        );
        await expect(
          c.query(
            "insert into addresses (user_id, full_name, phone, governorate, city, address_line) values ($1, 'Bb', '01012345678', 'cairo', 'Nasr', '1 Street name')",
            [customerB],
          ),
        ).rejects.toThrow(/row-level security/);
      });
    });

    it("does not let browser roles call privileged functions", async () => {
      await expect(asRole(db.pool, "anon", null, (c) => c.query("select public.place_order('{}'::jsonb)"))).rejects.toThrow(/permission denied/);
      await expect(
        asRole(db.pool, "authenticated", customerA, (c) => c.query("select public.expire_stale_orders()")),
      ).rejects.toThrow(/permission denied/);
    });
  });

  // -------------------------------------------------------------------------
  describe("order placement", () => {
    it("reserves stock atomically for online payments and snapshots items", async () => {
      const before = await variant(DEV.cleanserVariant);
      const order = await placeOrder({}, [{ variant_id: DEV.cleanserVariant, quantity: 2, unit_price: "350.00" }]);
      const after = await variant(DEV.cleanserVariant);
      expect(after.reserved_quantity).toBe(before.reserved_quantity + 2);
      expect(after.stock_quantity).toBe(before.stock_quantity);
      const { rows } = await db.pool.query("select product_name_en, sku, unit_price, quantity from order_items where order_id = $1", [order.order_id]);
      expect(rows[0]).toMatchObject({ product_name_en: "[DEV] Gentle Cleanser", sku: "DEV-CLN-150", unit_price: "350.00", quantity: 2 });

      // Editing the product later does not change the historical order.
      await db.pool.query("update product_variants set price = 999 where id = $1", [DEV.cleanserVariant]);
      await db.pool.query("update product_translations set name = 'Renamed' where product_id = '00000000-0000-4000-8000-000000001001' and locale = 'en'");
      const { rows: again } = await db.pool.query("select product_name_en, unit_price from order_items where order_id = $1", [order.order_id]);
      expect(again[0]).toMatchObject({ product_name_en: "[DEV] Gentle Cleanser", unit_price: "350.00" });
      await db.pool.query("update product_variants set price = 350 where id = $1", [DEV.cleanserVariant]);
    });

    it("rejects tampered prices and totals", async () => {
      await expect(placeOrder({}, [{ variant_id: DEV.serumVariant, quantity: 1, unit_price: "1.00" }])).rejects.toThrow(/SL_PRICE_CHANGED/);
      await expect(placeOrder({ subtotal: "1.00", total: "61.00" })).rejects.toThrow(/SL_TOTAL_MISMATCH/);
      await expect(placeOrder({ total: "1.00" })).rejects.toThrow(/total_matches/);
    });

    it("is idempotent for repeated submissions", async () => {
      const key = "idempotency-key-repeat-0001";
      const first = await placeOrder({ idempotency_key: key });
      const second = await placeOrder({ idempotency_key: key });
      expect(second).toMatchObject({ order_id: first.order_id, duplicate: true });
    });

    it("refuses to oversell", async () => {
      const v = await variant(DEV.moisturizer50);
      const available = v.stock_quantity - v.reserved_quantity;
      await expect(
        placeOrder({}, [{ variant_id: DEV.moisturizer50, quantity: available + 1, unit_price: "410.00" }]),
      ).rejects.toThrow(/SL_OUT_OF_STOCK/);
    });

    it("allows exactly one winner when concurrent checkouts race for the last units", async () => {
      // Leave exactly one unit available.
      await db.pool.query("update product_variants set stock_quantity = reserved_quantity + 1 where id = $1", [DEV.moisturizer50]);
      const attempts = await Promise.allSettled(
        Array.from({ length: 6 }, () => placeOrder({}, [{ variant_id: DEV.moisturizer50, quantity: 1, unit_price: "410.00" }])),
      );
      const ok = attempts.filter((a) => a.status === "fulfilled");
      const failed = attempts.filter((a) => a.status === "rejected") as PromiseRejectedResult[];
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(5);
      failed.forEach((f) => expect(String(f.reason)).toMatch(/SL_OUT_OF_STOCK/));
      const after = await variant(DEV.moisturizer50);
      expect(after.reserved_quantity).toBeLessThanOrEqual(after.stock_quantity);
    });

    it("commits stock immediately for cash on delivery", async () => {
      const before = await variant(DEV.cleanserVariant);
      const order = await placeOrder({ payment_method: "cod", cod_fee: "15.00" }, [{ variant_id: DEV.cleanserVariant, quantity: 1, unit_price: "350.00" }]);
      const after = await variant(DEV.cleanserVariant);
      expect(after.stock_quantity).toBe(before.stock_quantity - 1);
      const { rows } = await db.pool.query("select status, payment_status, stock_state, total from orders where id = $1", [order.order_id]);
      expect(rows[0]).toMatchObject({ status: "confirmed", payment_status: "cod_pending", stock_state: "committed", total: "425.00" });
    });

    it("enforces coupon usage limits under concurrency", async () => {
      const { rows } = await db.pool.query(
        "insert into coupons (code, discount_type, value, usage_limit) values ('ONEUSE', 'fixed', 10, 1) returning id",
      );
      const couponId = rows[0].id;
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, (_, i) =>
          placeOrder({ coupon_id: couponId, coupon_code: "ONEUSE", discount_total: "10.00", email: `c${i}@example.com` }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const { rows: c } = await db.pool.query("select usage_count from coupons where id = $1", [couponId]);
      expect(c[0].usage_count).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe("payments", () => {
    async function attemptFor(orderId: string, total: string) {
      const { rows } = await db.pool.query(
        "insert into payments (order_id, method, amount, special_reference) select id, 'paymob_card', $2, reference || '-1' from orders where id = $1 returning id",
        [orderId, total],
      );
      return rows[0].id as string;
    }
    const apply = async (paymentId: string, success: boolean, pending: boolean, amount: string, tx = "111") =>
      (await db.pool.query("select public.apply_payment_result($1, $2, $3, $4, $5, 'EGP', null) as r", [paymentId, tx, success, pending, amount])).rows[0].r as string;

    it("confirms payment once, converting the reservation into a sale (idempotent)", async () => {
      const before = await variant(DEV.serumVariant);
      const order = await placeOrder();
      const paymentId = await attemptFor(order.order_id, "580.00");
      expect(await apply(paymentId, true, false, "580.00")).toBe("paid");
      expect(await apply(paymentId, true, false, "580.00")).toBe("already_paid");
      const after = await variant(DEV.serumVariant);
      expect(after.stock_quantity).toBe(before.stock_quantity - 1);
      expect(after.reserved_quantity).toBe(before.reserved_quantity);
      const { rows } = await db.pool.query("select status, payment_status, stock_state from orders where id = $1", [order.order_id]);
      expect(rows[0]).toMatchObject({ status: "confirmed", payment_status: "paid", stock_state: "committed" });
    });

    it("rejects mismatched amounts and flags the order", async () => {
      const order = await placeOrder();
      const paymentId = await attemptFor(order.order_id, "580.00");
      expect(await apply(paymentId, true, false, "1.00", "555")).toBe("amount_mismatch");
      const { rows } = await db.pool.query("select payment_status, needs_attention from orders where id = $1", [order.order_id]);
      expect(rows[0]).toMatchObject({ payment_status: "pending", needs_attention: true });
    });

    it("keeps failed and pending payments unpaid with stock still reserved", async () => {
      const order = await placeOrder();
      const paymentId = await attemptFor(order.order_id, "580.00");
      expect(await apply(paymentId, false, true, "580.00", "444")).toBe("pending");
      expect(await apply(paymentId, false, false, "580.00", "444")).toBe("failed");
      const { rows } = await db.pool.query("select status, payment_status, stock_state from orders where id = $1", [order.order_id]);
      expect(rows[0]).toMatchObject({ status: "pending", payment_status: "failed", stock_state: "reserved" });
    });

    it("expires unpaid orders, releasing stock and coupon use", async () => {
      const before = await variant(DEV.serumVariant);
      const order = await placeOrder();
      await db.pool.query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [order.order_id]);
      const { rows } = await db.pool.query("select public.expire_stale_orders() as n");
      expect(rows[0].n).toBeGreaterThanOrEqual(1);
      const after = await variant(DEV.serumVariant);
      expect(after.reserved_quantity).toBe(before.reserved_quantity);
      const { rows: o } = await db.pool.query("select status, payment_status, stock_state from orders where id = $1", [order.order_id]);
      expect(o[0]).toMatchObject({ status: "cancelled", payment_status: "expired", stock_state: "released" });
    });

    it("accepts a late payment after expiry when stock is still available", async () => {
      const order = await placeOrder();
      const paymentId = await attemptFor(order.order_id, "580.00");
      await db.pool.query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [order.order_id]);
      await db.pool.query("select public.expire_stale_orders()");
      expect(await apply(paymentId, true, false, "580.00", "222")).toBe("paid");
      const { rows } = await db.pool.query("select status, payment_status, stock_state from orders where id = $1", [order.order_id]);
      expect(rows[0]).toMatchObject({ status: "confirmed", payment_status: "paid", stock_state: "committed" });
    });

    it("puts a late payment on hold when the stock is gone", async () => {
      const order = await placeOrder({}, [{ variant_id: DEV.cleanserVariant, quantity: 1, unit_price: "350.00" }]);
      const paymentId = await attemptFor(order.order_id, "410.00");
      await db.pool.query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [order.order_id]);
      await db.pool.query("select public.expire_stale_orders()");
      await db.pool.query("update product_variants set stock_quantity = reserved_quantity where id = $1", [DEV.cleanserVariant]);
      expect(await apply(paymentId, true, false, "410.00", "333")).toBe("paid_on_hold");
      const { rows } = await db.pool.query("select status, payment_status, needs_attention from orders where id = $1", [order.order_id]);
      expect(rows[0]).toMatchObject({ status: "on_hold", payment_status: "paid", needs_attention: true });
    });
  });

  // -------------------------------------------------------------------------
  describe("admin operations", () => {
    it("enforces valid order status transitions and restocks on cancellation", async () => {
      await db.pool.query("update product_variants set stock_quantity = 50 where id = $1", [DEV.cleanserVariant]);
      const order = await placeOrder({ payment_method: "cod" }, [{ variant_id: DEV.cleanserVariant, quantity: 2, unit_price: "350.00" }]);
      await expect(db.pool.query("select public.admin_set_order_status($1, 'delivered', null)", [order.order_id])).rejects.toThrow(/SL_INVALID_TRANSITION/);
      await db.pool.query("select public.admin_set_order_status($1, 'processing', null)", [order.order_id]);
      const before = await variant(DEV.cleanserVariant);
      await db.pool.query("select public.admin_set_order_status($1, 'cancelled', null, 'customer request', true)", [order.order_id]);
      const after = await variant(DEV.cleanserVariant);
      expect(after.stock_quantity).toBe(before.stock_quantity + 2);
    });

    it("does not allow confirming unpaid online orders or marking them paid manually", async () => {
      const order = await placeOrder();
      await expect(db.pool.query("select public.admin_set_order_status($1, 'confirmed', null)", [order.order_id])).rejects.toThrow(/SL_NOT_PAID/);
      await expect(db.pool.query("select public.admin_set_payment_status($1, 'paid', null)", [order.order_id])).rejects.toThrow(/SL_INVALID_TRANSITION/);
    });

    it("never lets stock drop below reserved quantities", async () => {
      await placeOrder();
      const v = await variant(DEV.serumVariant);
      await expect(
        db.pool.query("select public.admin_adjust_stock($1, $2, null, 'test')", [DEV.serumVariant, -(v.stock_quantity - v.reserved_quantity) - 1]),
      ).rejects.toThrow(/SL_STOCK_BELOW_RESERVED/);
    });

    it("rate limiter allows up to the limit within a window", async () => {
      const results: boolean[] = [];
      for (let i = 0; i < 4; i++) {
        results.push((await db.pool.query("select public.rate_limit_hit('test:key', 60, 3) as ok")).rows[0].ok);
      }
      expect(results).toEqual([true, true, true, false]);
    });
  });
});
