# SELIM LAB — E-commerce Store & Admin Dashboard

**SCIENCE IN EVERY FORMULA** · Arabic-first, bilingual (Arabic/English) e-commerce platform for SELIM LAB, a premium Egyptian skincare and specialized cosmetic formulation brand.

- **Storefront:** `/ar` (default, RTL) and `/en` (LTR). The home page, shop, product pages, cart, checkout, order tracking and customer accounts.
- **Admin dashboard:** `/ar/admin` or `/en/admin` (staff and administrators only).
- **Payments:** Paymob Unified Checkout (Intention API) and optional cash on delivery.

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions, `proxy.ts`), React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4, hand-authored components on Radix primitives (shadcn-style), self-hosted fonts (IBM Plex Sans Arabic, IBM Plex Sans, Cormorant Garamond) |
| Data | Supabase Postgres (+ RLS), Supabase Auth, Supabase Storage, `@supabase/ssr` |
| Validation | Zod 4 |
| Tests | Vitest (unit + real-Postgres integration), Playwright (end-to-end) |
| Hosting | Vercel (with Vercel Cron) |

---

## Contents

1. [Quick start (local)](#1-quick-start-local)
2. [Environment variables](#2-environment-variables)
3. [Database: migrations, RLS, seed](#3-database-migrations-rls-seed)
4. [Storage](#4-storage)
5. [Authentication & the first administrator](#5-authentication--the-first-administrator)
6. [Paymob setup](#6-paymob-setup)
7. [Deploying to Vercel](#7-deploying-to-vercel)
8. [Testing](#8-testing)
9. [Architecture](#9-architecture)
10. [Business rules (orders, stock, payments)](#10-business-rules-orders-stock-payments)
11. [Security](#11-security)
12. [Content & brand guidelines](#12-content--brand-guidelines)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Quick start (local)

Requirements: Node.js ≥ 20.9, npm, and either Docker (for the Supabase CLI local stack) or a Supabase cloud project.

```bash
npm install
cp .env.example .env.local        # then fill in the values (see section 2)

# Option A — local Supabase (Docker required)
npx supabase init                 # creates supabase/config.toml; keeps existing migrations
npx supabase start                # prints the local API URL + anon/service keys
npx supabase db reset             # applies supabase/migrations/* and supabase/seed.sql

# Option B — a Supabase cloud project (development project, NOT production)
npx supabase login
npx supabase link --project-ref <your-dev-project-ref>
npx supabase db push              # applies migrations
psql "<dev connection string>" -f supabase/seed.sql   # optional development data

npm run dev                       # http://localhost:3000 → redirects to /ar
```

The site works before anything is configured: without Supabase it renders the brand pages with empty states. Without Paymob it hides card payment.

`supabase/seed.sql` contains **development data only**. Every row is labelled `[DEV]` / `[تجريبي]`, with placeholder prices, shipping fees and FAQ answers and a `DEVTEST10` coupon. **Never run it in production.**

## 2. Environment variables

See [`.env.example`](.env.example) for every variable with comments.

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | public | yes | Canonical URL (SEO, auth emails, Paymob callback URLs) |
| `NEXT_PUBLIC_SUPABASE_URL` | public | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | yes | Anon or publishable key (RLS-restricted) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server** | yes | Service role / secret key: checkout, webhooks and the dashboard (after authorization checks) |
| `CRON_SECRET` | **server** | yes | Protects `/api/cron/expire-orders` |
| `PAYMOB_SECRET_KEY` | **server** | for card payments | Creates payment intentions |
| `PAYMOB_PUBLIC_KEY` | server | for card payments | Builds the Unified Checkout URL |
| `PAYMOB_HMAC_SECRET` | **server** | for card payments | Verifies transaction callbacks |
| `PAYMOB_INTEGRATION_ID` | server | for card payments | Card integration ID |
| `PAYMOB_WALLET_INTEGRATION_ID` | server | optional | Mobile-wallet integration ID |
| `PAYMOB_API_KEY` | **server** | recommended | Server-side transaction confirmation (defence in depth) |
| `PAYMOB_API_BASE_URL`, `PAYMOB_CHECKOUT_URL` | server | optional | Override Paymob endpoints (defaults: `https://accept.paymob.com`, `https://eg.checkout.paymob.com/`) |
| `TEST_DATABASE_URL` | tests only | for `npm run test:db` | Postgres server for integration tests |

Only `NEXT_PUBLIC_*` values reach the browser. Server values are read only in server modules (marked `server-only`).

## 3. Database: migrations, RLS, seed

Migrations live in `supabase/migrations/` and are applied in filename order:

| File | Contents |
| --- | --- |
| `…120000_core_schema.sql` | Enums and all tables (profiles, roles, addresses, catalogue + translations, variants, inventory movements, carts, shipping, coupons, orders + item snapshots + status history, payments + payment events, reviews, settings, homepage sections, FAQs, ingredients, content pages, newsletter, audit logs, rate limits) |
| `…120100_functions.sql` | Role helpers, new-user trigger, rate limiter, `place_order`, `commit_order_stock`, `release_order_stock`, `apply_payment_result`, `expire_stale_orders`, admin status/stock functions, execute privileges |
| `…120200_rls.sql` | RLS enabled on every table + policies |
| `…120300_storage.sql` | Public image buckets (`product-images`, `site-media`) with size/MIME limits |
| `…120400_catalog_view.sql` | `product_listing` view (security invoker) + Arabic search normalisation |

**Applying to production safely**

1. Test every new migration locally (`npx supabase db reset`) and on a staging/dev project first.
2. Back up production (Supabase → Database → Backups, or `pg_dump`).
3. `npx supabase link --project-ref <prod-ref>` then `npx supabase db push` (applies only migrations not yet applied).
4. Never edit an applied migration. Add a new one (`npx supabase migration new <name>`).
5. Do **not** run `seed.sql` in production. Enter real products, shipping rates and content through the dashboard.

Monetary values are `numeric(12,2)` in EGP. The application computes in integer piasters. Orders store `currency = 'EGP'` explicitly.

## 4. Storage

The storage migration creates two public-read buckets:

- `product-images` — product gallery images (`products/<productId>/<uuid>.<ext>`)
- `site-media` — homepage, category and ingredient images

Objects are served through public URLs; no listing policy is granted. Uploads happen only through dashboard Server Actions using the service role, after:
the staff session is verified → MIME type is in the allow-list (JPEG/PNG/WEBP/AVIF, **no SVG**) → the file signature (magic bytes) matches → size ≤ 5 MB → a random UUID file name is used.

If a bucket was created manually before the migration, the migration updates its settings (`on conflict do update`).

## 5. Authentication & the first administrator

Supabase Auth with email + password. Customers can register, sign in, reset their password, edit their profile, save addresses and see their orders. Guest checkout needs no account.

**Supabase dashboard settings (Authentication):**

1. **URL Configuration** → Site URL = your `NEXT_PUBLIC_SITE_URL`. Add `https://<domain>/auth/confirm` (and `http://localhost:3000/auth/confirm` for development) to the Redirect URLs.
2. **Email confirmation** (Providers → Email → Confirm email): recommended ON in production.
3. **Email templates** (recommended): point links to the app's confirm route, e.g. *Confirm signup*:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/ar/account`
   and *Reset password*:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/ar/account/reset-password`.
   The default templates (PKCE `code` links) are also supported by `/auth/confirm`.
4. **SMTP**: configure a custom SMTP provider for production. The built-in email service is heavily rate-limited.

**Roles.** `user_roles` can be written **only** with the service role. Public sign-up never assigns roles, and RLS blocks customers from inserting role rows. Roles:

- `admin` — everything, including settings, payment methods, shipping, coupons, customers, team and audit log.
- `staff` — orders, products, categories, content, FAQs, ingredients and reviews. Shipping and coupons are read-only.

**Create the first administrator (secure, documented way):**

1. Register on the site with the owner's email (and confirm it if confirmation is on).
2. On a trusted machine with `.env.local` pointing at the target project:
   ```bash
   npm run admin:grant -- owner@example.com admin
   ```
   (equivalent: `node --env-file=.env.local scripts/grant-role.mjs owner@example.com admin`). The script logs an audit entry.
   Alternatively, run in the Supabase SQL editor:
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'owner@example.com'
   on conflict do nothing;
   ```
3. Further staff/admins can then be managed from **Dashboard → Team**.

## 6. Paymob setup

The integration uses Paymob's current **Unified Checkout / Intention API** (Egypt):

1. Server validates checkout, recalculates every price from the database, creates the order (`place_order`: prices re-verified and stock reserved under row locks) and a payment attempt.
2. Server creates an intention: `POST {PAYMOB_API_BASE_URL}/v1/intention/` with `Authorization: Token <PAYMOB_SECRET_KEY>`, amount in piasters, `currency: EGP`, `payment_methods: [<integration id>]`, `billing_data`, `special_reference = <order reference>-<attempt>`, `notification_url`, `redirection_url`, `expiration`.
3. Customer is redirected to `PAYMOB_CHECKOUT_URL?publicKey=…&clientSecret=…`.
4. Paymob POSTs the **transaction processed callback** to `/api/paymob/webhook?hmac=…`. The app:
   verifies the HMAC-SHA512 (documented 20-field concatenation, constant-time compare) → checks the integration ID is ours → matches our payment attempt (`intention_order_id` / `merchant_order_id`) → records the event once (idempotency key) → checks amount and currency exactly → optionally confirms with Paymob's API (`PAYMOB_API_KEY`) → applies the result atomically (`apply_payment_result`).
5. The customer returns to `/api/paymob/return`. **The query string is never trusted to mark an order paid.** If its HMAC is valid, the app reconciles by fetching the transaction from Paymob server-side, then shows the order page (which polls while pending).

**Paymob dashboard checklist**

- [ ] Test-mode secret key, public key, HMAC secret and card integration ID (then the live ones for production)
- [ ] (Optional) wallet integration ID; (recommended) API key
- [ ] Transaction processed callback: `https://<your-domain>/api/paymob/webhook`
- [ ] Transaction response callback: `https://<your-domain>/api/paymob/return`
  (The app also sends both URLs per intention. Keep the dashboard values consistent.)
- [ ] Enable **Card payments via Paymob** in *Dashboard → Settings* once the variables are set. The settings page shows whether the server is configured.
- [ ] Run a full test-mode purchase (success **and** failure) on the deployed preview before switching to live keys.

**Status: not yet tested against Paymob's real sandbox.** Credentials weren't available while this was built, so the flow was verified end-to-end only with a local Paymob simulator that signs callbacks exactly as documented. Run the checklist above with your own test keys before going live.

## 7. Deploying to Vercel

Deploying the frontend does **not** configure Supabase, Storage or Paymob. Do all of these:

1. Create a **production** Supabase project (separate from development). Apply migrations (section 3). Configure Auth (section 5).
2. Import the Git repository in Vercel (framework: Next.js, default build command `next build`, Node 20+).
3. Add the environment variables (section 2) for **Production** and **Preview** separately. Use Paymob **test** keys for Preview.
4. Set `NEXT_PUBLIC_SITE_URL` to the production domain (e.g. `https://selimlab.com`). Add the domain in Vercel → Domains.
5. `vercel.json` schedules `/api/cron/expire-orders` daily (03:00 UTC, the Hobby-plan limit). On Vercel Pro, change it to `*/15 * * * *` for faster release of unpaid reservations. It releases unpaid reservations and prunes rate-limit windows and abandoned guest carts. Vercel Hobby plans only allow daily crons: either upgrade, or change the schedule. Expired reservations are also released opportunistically at every checkout.
6. Configure the Paymob callback URLs for the production domain (section 6).
7. Create the first administrator (section 5), then enter real store settings, shipping zones and rates, products and content in the dashboard. Enable the payment methods last.
8. Preview deployments automatically serve `robots.txt` with `Disallow: /`.

## 8. Testing

```bash
npm run typecheck   # next typegen + tsc (strict)
npm run lint        # ESLint (next/core-web-vitals + typescript)
npm test            # unit tests (+ DB tests when TEST_DATABASE_URL is set)
npm run test:db     # integration tests against real Postgres (RLS, concurrency, payments)
npm run build && npm run test:e2e   # Playwright against the production build
npm run check       # typecheck + lint + test + build
```

- **Unit** (`tests/unit`): locale routing and RTL/LTR, dictionary parity, pricing/discount allocation/shipping/COD, coupons, shipping rules, validation (phone, checkout payload rejects client prices), open-redirect protection, upload signature checks, log redaction, Paymob HMAC (field order, booleans, tampering, wrong secret, redirect format), payment processing (invalid signature, forged success, idempotent duplicates, amount/currency mismatch, unknown integration, pending/failed, API contradiction, API outage, DB failure → retry), dashboard authorization.
- **Database** (`tests/db`, needs `TEST_DATABASE_URL`): each run creates a throwaway database with a minimal Supabase shim, all migrations and the seed. It covers RLS for visitors and customers (catalogue visibility, private tables, role escalation, order ownership, addresses), privileged function permissions, price tampering, idempotency, overselling, **concurrent checkouts racing for the last unit**, concurrent coupon redemptions, payment confirmation/idempotency/mismatch/failure, expiry, late payments, admin transitions and stock floors.
- **E2E** (`tests/e2e`): `/` → `/ar`, `lang`/`dir`, language switcher keeps the page, noindex on private pages, dashboard protection, localized 404, product listing, no horizontal overflow at 360 px.

Automated tests never use live payment credentials.

## 9. Architecture

```
src/
  proxy.ts                    locale routing (/ → /ar) + Supabase session refresh
  i18n/                       locales, storefront & dashboard dictionaries (ar/en)
  app/
    [locale]/layout.tsx       <html lang dir>, fonts, metadata
    [locale]/(store)/…        storefront pages (home, shop, products, cart, checkout, order, account, pages)
    [locale]/admin/…          dashboard (server-authorised in layout AND every page/action)
    api/paymob/webhook        Paymob transaction callback (HMAC-verified)
    api/paymob/return         customer return URL (reconciliation only)
    api/cron/expire-orders    scheduled maintenance (CRON_SECRET)
    auth/confirm              Supabase email links
    sitemap.ts, robots.ts
  components/                 UI (ui/, layout/, product/, cart/, checkout/, account/, order/, admin/)
  lib/                        env, money, i18n helpers, validation, security (tokens, rate limit, uploads, redirects), auth, audit, seo
  lib/commerce/               pure pricing, coupon and shipping rules (unit tested)
  server/                     data access (catalog, content, cart, orders, checkout), payments (Paymob client, HMAC, processing, repository), admin (guard, loaders), Server Actions
supabase/migrations, supabase/seed.sql
scripts/grant-role.mjs
tests/unit, tests/db, tests/e2e
```

- **Rendering:** Server Components by default. Client Components only for interactivity (gallery, add-to-cart, checkout form, menus, dashboard forms). `cacheComponents` is deliberately off. Public catalogue/content reads are cached with tags (`catalog`, `content`, `settings`, `shipping`) and invalidated by dashboard mutations. Personalised pages render dynamically.
- **Supabase clients:** a request-scoped user client (RLS as the customer), a cookie-less anon client (public reads) and a server-only service client (checkout, webhooks, dashboard **after** authorization).
- **Cart:** stored in Postgres. Guests get a random 256-bit token in an httpOnly cookie (only its SHA-256 is stored). Signed-in users have one cart per user. The guest cart is merged at sign-in. Prices are never stored in the cart.

## 10. Business rules (orders, stock, payments)

| Topic | Policy |
| --- | --- |
| Pricing | Recomputed on the server from DB records. `place_order` re-checks every unit price under row locks and rejects mismatches (`SL_PRICE_CHANGED`). |
| Order status vs payment status | Separate enums. Order: pending → confirmed → processing → shipped → delivered (or cancelled / on_hold). Payment: pending, paid, failed, expired, cancelled, refunded, partially_refunded, cod_pending. |
| Stock reservation | Online payments reserve stock (`reserved_quantity`) for `reservation_minutes` (default 30, set in the dashboard). Available = stock − reserved. |
| Payment confirmed | The reservation becomes a sale (stock decremented, best-seller count updated). |
| Payment failed | Order stays reserved until expiry, so the customer can **retry payment** from the order page (a new Paymob attempt). |
| Payment expiry | Cron/checkout releases the reservation, sets status `cancelled` / payment `expired` and returns the coupon use. |
| Late payment (after expiry) | If stock is still available it's committed and the order confirmed. Otherwise the order is `on_hold`, flagged *needs attention* for a refund or restock. |
| Cash on delivery | Disabled until an admin enables it. Stock is committed at placement, payment `cod_pending`. An admin marks it `paid` when collected. Optional COD fee and maximum order value. |
| Cancellation | Staff can cancel allowed statuses. The reservation is released, or committed stock is returned (optional restock). |
| Refunds | Issue refunds in the **Paymob dashboard**, then record them in the order (`refunded` / `partially_refunded`, optional restock). Paymob refund/void notifications flag the order for review. |
| Duplicates | Checkout idempotency key (no duplicate orders on double-submit). Unique payment event keys (no duplicate payment processing). Transaction IDs are unique. |
| Guest order access | Order pages require the owner's session **or** a 256-bit secret token (httpOnly cookie set at checkout + the "save this link" URL). References alone grant nothing. |

## 11. Security

- Strict TypeScript. Zod validation for every action and route input.
- Authorization on the server: the dashboard layout, every dashboard page (`requireStaffPage`) and every mutation (`adminAction`) re-check the session and the role (roles read with the service role). Hidden links are not the protection.
- RLS on all tables. Browsers can only read public content and their own records. All writes go through server code.
- CSRF: Server Actions are origin-checked by Next.js. The webhook is HMAC-verified. Cron uses a bearer secret. There are no state-changing GET routes except authenticated email links.
- Rate limiting (Postgres-backed, works across serverless instances) on checkout, payment retries, coupons, auth, newsletter, reviews and cart.
- Secure cookies (httpOnly, `SameSite=Lax`, `Secure` in production). Security headers: CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy. Order pages send `no-referrer`.
- No card data is ever handled or stored (hosted checkout). Payment events store a sanitised payload only. Logs redact secrets and personal data.
- Uploads: allow-list + magic-byte check + size limit + random names. SVG is rejected.
- Open-redirect protection on `?next=`. Safe JSON-LD serialisation. Policy pages render plain text (no HTML injection).
- Customer records are restricted to admins and viewing them is audit-logged. Important admin actions are written to `audit_logs`.

## 12. Content & brand guidelines

- Palette tokens are in `src/app/globals.css`: Warm Ivory `#F8F3E9`, Champagne Gold `#C9A96A`, Warm Brown `#4A3B2E`, Deep Brown `#2A2118`.
- The approved logo is `public/brand/selim-lab-logo.png` and is used unchanged. `BrandLogo` only crops the file's empty transparent margin. The header uses the SL monogram region of the same artwork; the footer, hero placeholder and auth screens use the full lockup. To replace it later (e.g. with an SVG), swap the file and adjust the crop boxes in `src/components/layout/brand-logo.tsx`.
- **Do not invent claims.** Product ingredients, clinical results, certifications, testimonials and therapeutic claims must come from SELIM LAB and be legally appropriate. Reviews appear only when genuine customers submit them and staff approve them. Each product page shows a cosmetic-use notice.
- Marketing copy defaults live in `src/i18n/dictionaries/*`. The hero, philosophy, brand story and other homepage text can be overridden per language in *Dashboard → Homepage content*.

## 13. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Site shows only empty states | Supabase variables missing or migrations not applied. Check `.env.local` / Vercel env and run `npx supabase db push`. |
| "Card payment" not offered at checkout | It must be enabled in *Settings* **and** the Paymob variables (`PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_ID`) must be set. The settings page shows "Configured on the server". |
| Order stays "awaiting payment confirmation" | The webhook isn't reaching the app. Check the callback URL in Paymob, Vercel function logs (`paymob.webhook`), and that `PAYMOB_HMAC_SECRET` matches the dashboard (an `invalid_signature` outcome means a wrong secret). |
| `/admin` returns 404 | The account has no role. See section 5. |
| Auth emails link to localhost | Set Site URL / Redirect URLs in Supabase Auth and `NEXT_PUBLIC_SITE_URL`. |
| Product images don't load | `NEXT_PUBLIC_SUPABASE_URL` must be set at **build** time (used for `next/image` remote patterns). Redeploy after changing it. |
| Upload rejected | Only JPG/PNG/WEBP/AVIF ≤ 5 MB with a matching file signature. |
| Cron returns 401 | `CRON_SECRET` is missing or shorter than 16 characters. |
| Prices changed / out-of-stock errors at checkout | Expected protection: the cart was modified or stock ran out. The customer reviews the cart and retries. |
