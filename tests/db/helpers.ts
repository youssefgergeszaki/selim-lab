import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";

/**
 * Database tests run against a real PostgreSQL server (TEST_DATABASE_URL, e.g. the local
 * Supabase database: postgresql://postgres:postgres@127.0.0.1:54322/postgres).
 * Each test file creates and drops its own throwaway database, applying the Supabase shim,
 * every migration and the development seed.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const root = join(__dirname, "..", "..");

export interface TestDb {
  url: string;
  pool: pg.Pool;
  drop(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDb> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  const name = `selimlab_test_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 6 });
  const files = [
    join(root, "tests/db/supabase-shim.sql"),
    ...readdirSync(join(root, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => join(root, "supabase/migrations", f)),
    join(root, "supabase/seed.sql"),
  ];
  for (const file of files) await pool.query(readFileSync(file, "utf8"));

  return {
    url: url.toString(),
    pool,
    async drop() {
      await pool.end();
      const c = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

/** Runs `fn` inside a transaction acting as a Supabase role (RLS applies), then rolls back. */
export async function asRole<T>(
  pool: pg.Pool,
  role: "anon" | "authenticated",
  userId: string | null,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role } : { role }),
    ]);
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

export async function createUser(pool: pg.Pool, email: string): Promise<string> {
  const { rows } = await pool.query("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [
    email,
    JSON.stringify({ full_name: email.split("@")[0] }),
  ]);
  return rows[0].id;
}

export const DEV = {
  cleanserVariant: "00000000-0000-4000-8000-000000002001",
  serumVariant: "00000000-0000-4000-8000-000000002002",
  moisturizer50: "00000000-0000-4000-8000-000000002003",
  cairoRate: null as string | null,
};

let refCounter = 0;
export function orderPayload(over: Record<string, unknown> = {}) {
  refCounter += 1;
  const suffix = randomBytes(3).toString("hex").toUpperCase().replace(/[^A-Z0-9]/g, "X").padEnd(6, "X").slice(0, 6);
  return {
    reference: `SL-261009-${suffix}`,
    access_token_hash: "a".repeat(64),
    idempotency_key: `test-key-${refCounter}-${randomBytes(8).toString("hex")}`,
    user_id: null,
    locale: "ar",
    email: "guest@example.com",
    phone: "01012345678",
    full_name: "Test Customer",
    governorate: "cairo",
    city: "Nasr City",
    address_line: "10 Abbas El Akkad St",
    notes: "",
    payment_method: "paymob_card",
    shipping_method_name: "Standard",
    coupon_id: null,
    coupon_code: null,
    discount_total: "0.00",
    cod_fee: "0.00",
    reservation_minutes: 30,
    ...over,
  };
}
