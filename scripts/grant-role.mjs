#!/usr/bin/env node
/**
 * Grants a dashboard role to an existing user (the secure way to create the first administrator).
 *
 *   node --env-file=.env.local scripts/grant-role.mjs owner@example.com admin
 *   node --env-file=.env.local scripts/grant-role.mjs staff@example.com staff
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 * The user must already have registered (and confirmed their email if confirmation is on).
 * Run it from a trusted machine only — it uses the service-role key.
 */
import { createClient } from "@supabase/supabase-js";

const [, , rawEmail, role = "admin"] = process.argv;
const email = (rawEmail ?? "").trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !["admin", "staff"].includes(role)) {
  console.error("Usage: node --env-file=.env.local scripts/grant-role.mjs <email> [admin|staff]");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let userId = null;
for (let page = 1; page <= 50 && !userId; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("Could not list users:", error.message);
    process.exit(1);
  }
  userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
  if (data.users.length < 200) break;
}
if (!userId) {
  console.error(`No user found for ${email}. Ask them to register first.`);
  process.exit(1);
}

const { error } = await db.from("user_roles").upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
if (error) {
  console.error("Could not grant role:", error.message);
  process.exit(1);
}
await db.from("audit_logs").insert({
  actor_id: null,
  actor_email: "cli:grant-role",
  action: "role.grant",
  entity_type: "user",
  entity_id: userId,
  metadata: { role, via: "scripts/grant-role.mjs" },
});
console.log(`Granted "${role}" to ${email} (${userId}).`);
