# SELIM LAB — Implementation report & launch checklist

## Completed

| Area | Status |
| --- | --- |
| Arabic-first bilingual storefront (`/` → `/ar`, RTL/LTR, `lang`/`dir`, page-preserving language switcher, dictionary-based UI text, logical CSS properties) | ✅ |
| Brand design system (exact palette tokens, IBM Plex Sans Arabic / IBM Plex Sans / Cormorant Garamond self-hosted, approved logo used unchanged) | ✅ |
| Home page: announcement bar, header (logo, nav, search, account, cart, language), hero, collections, best sellers (from confirmed sales), philosophy, admin-managed ingredients, featured products, Dr. Selim story, genuine reviews only, FAQ, newsletter, footer | ✅ |
| Shop: search (Arabic-normalised), category/collection filters, in-stock filter, sorting (featured/newest/price), server-side pagination, sale prices, stock badges, empty states | ✅ |
| Product page: gallery, localized slugs (with cross-locale redirect), variants, SKU, stock, ingredients/how-to-use/warnings/attributes, quantity, add to cart, related products, reviews + moderated submissions, Product/Breadcrumb JSON-LD, cosmetic notice | ✅ |
| Cart: guest + signed-in (DB-persisted, merged at sign-in), quantity updates, coupon, discount, shipping estimate by governorate, stock issues surfaced | ✅ |
| Checkout: guest checkout, Egyptian phone validation/normalisation, 27 governorates, configurable zones/rates/free-shipping thresholds, saved addresses, payment method selection, COD (admin-enabled, optional fee and max total), server-side validation and pricing, idempotent submission | ✅ |
| Orders: atomic placement with row-locked stock reservation, item snapshots, status history, secure guest access (secret token), retry payment, expiry, late-payment handling | ✅ |
| Paymob Unified Checkout (Intention API): intention creation, hosted redirect, HMAC-SHA512 webhook verification, attempt matching, amount/currency checks, optional API confirmation, idempotent processing, failure/pending/expiry handling, return-URL reconciliation | ✅ (tested with a local Paymob simulator — see *Pending*) |
| Accounts: register, sign in/out, password reset, email-link confirmation route, profile, addresses, order history and detail | ✅ |
| Dashboard: overview stats, products (translations, SEO, categories, variants, stock adjustments, image uploads), categories/collections, orders (filters, status transitions, payment status for COD/refunds, payment attempts and gateway events, notes, needs-attention flag), shipping zones & rates, coupons, homepage sections, ingredients, FAQ, pages/policies, review moderation, customers (admin-only, audit-logged), settings (contact, socials, announcement, payment methods with server-configuration status, reservation window, low-stock threshold), team/roles, audit log; Arabic and English UI | ✅ |
| Supabase schema, migrations, RLS on every table, storage buckets, seed (development-only) | ✅ |
| Security: server-side authorization everywhere, Zod validation, Postgres-backed rate limiting, CSP + security headers, secure cookies, upload signature checks, open-redirect protection, log redaction, audit logs | ✅ |
| SEO: localized titles/descriptions, canonical + hreflang (incl. x-default), sitemap with alternates, robots (preview deployments blocked), Open Graph, JSON-LD, noindex on private pages | ✅ |
| Tests: 84 unit tests, 24 real-Postgres integration tests (RLS, concurrency, payments), Playwright e2e (routing, RTL/LTR, protection, mobile overflow) | ✅ all passing |
| Vercel readiness: production build passes, `vercel.json` cron, `.env.example`, README | ✅ |

## Credentials & external settings still required

**Supabase (production project)**
- [ ] Project URL, anon/publishable key and service-role/secret key → Vercel env
- [ ] `npx supabase db push` (migrations) — do not run `seed.sql`
- [ ] Auth → Site URL and Redirect URLs (`https://<domain>/auth/confirm`)
- [ ] Auth → Email confirmation (recommended on), email templates (README §5), custom SMTP
- [ ] First administrator (`npm run admin:grant -- owner@… admin`)

**Paymob (Egypt)**
- [ ] Secret key, public key, HMAC secret, card integration ID (test first, then live)
- [ ] Optional wallet integration ID; recommended API key
- [ ] Callback URLs: `https://<domain>/api/paymob/webhook` (processed) and `https://<domain>/api/paymob/return` (response)
- [ ] One successful and one failed **test-mode** payment on the deployed preview

**Vercel**
- [ ] All env vars for Production and Preview (Preview with Paymob test keys)
- [ ] `NEXT_PUBLIC_SITE_URL` = production domain; domain connected
- [ ] `CRON_SECRET`; plan that supports the 15-minute cron (or adjust `vercel.json`)

**Business content (via the dashboard)**
- [ ] Real products: names, descriptions, verified ingredient lists, directions, warnings, prices, stock, photos
- [ ] Shipping zones, rates and delivery times; COD on/off, fee and limit
- [ ] Contact details, social links, announcement
- [ ] Policy pages (privacy, terms, shipping, returns) — reviewed by a legal advisor
- [ ] FAQ answers, Dr. Selim story, hero photography

## Pending / known limitations

- **Paymob not tested against the real gateway.** No credentials were available. The full flow (intention → hosted page → signed webhook → return) was exercised end-to-end against a local simulator implementing Paymob's documented formats. Run the test-mode checklist above before going live, and confirm the checkout host (`https://eg.checkout.paymob.com/` per current Egypt docs) matches your account.
- **Refunds are recorded, not executed.** Issue refunds in the Paymob dashboard, then record them in the order. Paymob refund/void notifications flag the order for review.
- **Transactional emails** (order confirmation, shipping updates) are not sent. The customer gets a private tracking link after checkout. Add an email provider (e.g. Resend/SES) if needed.
- **Stock reservations** are released by the cron job (every 15 min) and at each checkout. On Vercel Hobby, crons run at most daily.
- **Newsletter** subscribers are stored and listed for admins. There's no email-marketing integration or unsubscribe link flow yet.
- **Search** uses Arabic-normalised substring matching, which is fine for a boutique catalogue. Consider Postgres full-text or trigram indexes if the catalogue grows to thousands of products.
- **Product content** is plain text (line breaks preserved). Rich text/HTML isn't supported, by design (no injection risk).
- **Header logo** uses the SL monogram region of the supplied artwork, because the full lockup is illegible at header height. The full lockup appears in the hero placeholder, footer and auth screens. Replace with a transparent PNG/SVG when available.
- **Hero image** shows the logo lockup on an ivory panel until product photography is uploaded in *Dashboard → Homepage content*.
