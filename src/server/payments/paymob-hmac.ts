import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paymob HMAC verification (HMAC-SHA512, hex) for transaction callbacks.
 * Per Paymob's documentation, the following fields are concatenated — values only,
 * no separators, booleans as lowercase "true"/"false", missing values as "" — in this order:
 *
 * amount_cents, created_at, currency, error_occured, has_parent_transaction, id,
 * integration_id, is_3d_secure, is_auth, is_capture, is_refunded, is_standalone_payment,
 * is_voided, order.id, owner, pending, source_data.pan, source_data.sub_type,
 * source_data.type, success
 *
 * The HMAC is delivered in the `hmac` query parameter for both the server-to-server
 * "transaction processed" callback (POST JSON body under `obj`) and the browser
 * "transaction response" redirect (GET query string with flattened keys).
 */

export const HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
] as const;

/** Redirect (GET) callbacks flatten nested keys: order.id -> order, source_data.pan -> source_data.pan */
const REDIRECT_KEY: Record<(typeof HMAC_FIELDS)[number], string> = {
  amount_cents: "amount_cents",
  created_at: "created_at",
  currency: "currency",
  error_occured: "error_occured",
  has_parent_transaction: "has_parent_transaction",
  id: "id",
  integration_id: "integration_id",
  is_3d_secure: "is_3d_secure",
  is_auth: "is_auth",
  is_capture: "is_capture",
  is_refunded: "is_refunded",
  is_standalone_payment: "is_standalone_payment",
  is_voided: "is_voided",
  "order.id": "order",
  owner: "owner",
  pending: "pending",
  "source_data.pan": "source_data.pan",
  "source_data.sub_type": "source_data.sub_type",
  "source_data.type": "source_data.type",
  success: "success",
};

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function readPath(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const key of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  // `order` may be an object ({ id }) or a bare id depending on the payload version.
  if (path === "order.id" && current === undefined && obj && typeof obj === "object") {
    const order = (obj as Record<string, unknown>).order;
    if (typeof order === "number" || typeof order === "string") return order;
  }
  return current;
}

/** Concatenated string for the POST "transaction processed" callback (`obj` payload). */
export function processedCallbackString(obj: Record<string, unknown>): string {
  return HMAC_FIELDS.map((field) => stringify(readPath(obj, field))).join("");
}

/** Concatenated string for the GET "transaction response" redirect query parameters. */
export function redirectCallbackString(params: URLSearchParams | Record<string, string | undefined>): string {
  const get = (key: string) =>
    params instanceof URLSearchParams ? params.get(key) ?? "" : (params[key] ?? "");
  return HMAC_FIELDS.map((field) => get(REDIRECT_KEY[field])).join("");
}

export function computeHmac(message: string, secret: string): string {
  return createHmac("sha512", secret).update(message, "utf8").digest("hex");
}

/** Constant-time comparison; returns false for malformed input instead of throwing. */
export function verifyHmac(message: string, received: string | null | undefined, secret: string): boolean {
  if (!received || !secret || !/^[0-9a-f]{128}$/i.test(received)) return false;
  const expected = Buffer.from(computeHmac(message, secret), "hex");
  const given = Buffer.from(received.toLowerCase(), "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
