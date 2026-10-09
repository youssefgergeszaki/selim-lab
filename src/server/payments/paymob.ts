import "server-only";
import { logger } from "@/lib/logger";

/**
 * Paymob (Egypt) Unified Checkout integration via the Intention API.
 *
 * Flow: server creates an intention (POST {base}/v1/intention/, `Authorization: Token <secret key>`)
 * -> customer is redirected to Unified Checkout with the public key + client secret
 * -> Paymob POSTs the "transaction processed" callback to notification_url (HMAC verified)
 * -> customer is redirected back to redirection_url (never trusted to mark an order paid).
 *
 * All credentials are server-only environment variables.
 */

export type PaymobMethod = "paymob_card" | "paymob_wallet";

export interface PaymobConfig {
  apiBase: string;
  checkoutUrl: string;
  secretKey: string;
  publicKey: string;
  hmacSecret: string;
  apiKey: string | null;
  integrationIds: Partial<Record<PaymobMethod, number>>;
}

function parseIntegrationId(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Returns null when the core credentials are missing (Paymob is then shown as unavailable). */
export function getPaymobConfig(): PaymobConfig | null {
  const secretKey = process.env.PAYMOB_SECRET_KEY;
  const publicKey = process.env.PAYMOB_PUBLIC_KEY;
  const hmacSecret = process.env.PAYMOB_HMAC_SECRET;
  if (!secretKey || !publicKey || !hmacSecret) return null;
  const integrationIds: Partial<Record<PaymobMethod, number>> = {};
  const card = parseIntegrationId(process.env.PAYMOB_INTEGRATION_ID);
  const wallet = parseIntegrationId(process.env.PAYMOB_WALLET_INTEGRATION_ID);
  if (card) integrationIds.paymob_card = card;
  if (wallet) integrationIds.paymob_wallet = wallet;
  return {
    apiBase: (process.env.PAYMOB_API_BASE_URL || "https://accept.paymob.com").replace(/\/+$/, ""),
    checkoutUrl: process.env.PAYMOB_CHECKOUT_URL || "https://eg.checkout.paymob.com/",
    secretKey,
    publicKey,
    hmacSecret,
    apiKey: process.env.PAYMOB_API_KEY || null,
    integrationIds,
  };
}

export function isPaymobMethodConfigured(method: PaymobMethod, config = getPaymobConfig()): boolean {
  return Boolean(config?.integrationIds[method]);
}

/** All integration IDs we accept in callbacks (used to reject foreign transactions). */
export function configuredIntegrationIds(config = getPaymobConfig()): number[] {
  return Object.values(config?.integrationIds ?? {}).filter((v): v is number => typeof v === "number");
}

export class PaymobError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PaymobError";
  }
}

const TIMEOUT_MS = 15_000;

async function paymobFetch(url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (error) {
    throw new PaymobError(`network: ${error instanceof Error ? error.name : "unknown"}`);
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    // Never log the body of failed requests verbatim (may echo customer data).
    throw new PaymobError(`http ${response.status}`, response.status);
  }
  return body;
}

export interface IntentionInput {
  amountCents: number;
  method: PaymobMethod;
  specialReference: string;
  orderReference: string;
  itemName: string;
  billing: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string; // E.164
    city: string;
    state: string;
    street: string;
  };
  notificationUrl: string;
  redirectionUrl: string;
  expirationSeconds: number;
}

export interface IntentionResult {
  intentionId: string;
  clientSecret: string;
  intentionOrderId: string | null;
}

export async function createIntention(input: IntentionInput, config = getPaymobConfig()): Promise<IntentionResult> {
  if (!config) throw new PaymobError("not configured");
  const integrationId = config.integrationIds[input.method];
  if (!integrationId) throw new PaymobError("integration not configured");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new PaymobError("invalid amount");

  const body = {
    amount: input.amountCents,
    currency: "EGP",
    payment_methods: [integrationId],
    // A single summary line keeps item totals exactly equal to the charged amount
    // (shipping and discounts included).
    items: [{ name: input.itemName.slice(0, 50), amount: input.amountCents, description: input.orderReference, quantity: 1 }],
    billing_data: {
      first_name: input.billing.firstName.slice(0, 50) || "NA",
      last_name: input.billing.lastName.slice(0, 50) || "NA",
      email: input.billing.email,
      phone_number: input.billing.phone,
      street: input.billing.street.slice(0, 100) || "NA",
      building: "NA",
      floor: "NA",
      apartment: "NA",
      city: input.billing.city.slice(0, 50) || "NA",
      state: input.billing.state.slice(0, 50) || "NA",
      country: "EG",
    },
    special_reference: input.specialReference,
    extras: { order_reference: input.orderReference },
    notification_url: input.notificationUrl,
    redirection_url: input.redirectionUrl,
    expiration: input.expirationSeconds,
  };

  const data = (await paymobFetch(`${config.apiBase}/v1/intention/`, {
    method: "POST",
    headers: { Authorization: `Token ${config.secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })) as Record<string, unknown> | null;

  const clientSecret = typeof data?.client_secret === "string" ? data.client_secret : null;
  const intentionId = typeof data?.id === "string" ? data.id : data?.id ? String(data.id) : null;
  if (!clientSecret || !intentionId) throw new PaymobError("unexpected intention response");
  const orderId = data?.intention_order_id;
  return {
    intentionId,
    clientSecret,
    intentionOrderId: orderId === undefined || orderId === null ? null : String(orderId),
  };
}

export function unifiedCheckoutUrl(clientSecret: string, config = getPaymobConfig()): string {
  if (!config) throw new PaymobError("not configured");
  const url = new URL(config.checkoutUrl);
  url.searchParams.set("publicKey", config.publicKey);
  url.searchParams.set("clientSecret", clientSecret);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Authoritative transaction lookup (defence in depth for callbacks)
// ---------------------------------------------------------------------------
let cachedToken: { token: string; expiresAt: number } | null = null;

async function authToken(config: PaymobConfig): Promise<string> {
  if (!config.apiKey) throw new PaymobError("api key not configured");
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const data = (await paymobFetch(`${config.apiBase}/api/auth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: config.apiKey }),
  })) as { token?: string } | null;
  if (!data?.token) throw new PaymobError("auth token missing");
  // Tokens are valid for ~60 minutes; refresh early.
  cachedToken = { token: data.token, expiresAt: Date.now() + 50 * 60 * 1000 };
  return data.token;
}

/**
 * Retrieves a transaction from Paymob by id. Returns null when lookups are not configured
 * (no PAYMOB_API_KEY). Throws PaymobError on network/API failures.
 */
export async function retrieveTransaction(
  transactionId: string,
  config = getPaymobConfig(),
): Promise<Record<string, unknown> | null> {
  if (!config?.apiKey) return null;
  if (!/^\d{1,20}$/.test(transactionId)) throw new PaymobError("invalid transaction id");
  const token = await authToken(config);
  try {
    return (await paymobFetch(`${config.apiBase}/api/acceptance/transactions/${transactionId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })) as Record<string, unknown> | null;
  } catch (error) {
    if (error instanceof PaymobError && error.status === 401) cachedToken = null;
    logger.warn("paymob.inquiry_failed", { error: String(error) });
    throw error;
  }
}
