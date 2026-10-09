import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { Alert, Container } from "@/components/ui/misc";
import { CheckoutForm, type SavedAddress } from "@/components/checkout/checkout-form";
import { getCartView } from "@/server/cart";
import { enabledPaymentMethods, loadSettingsFresh, loadShippingFresh } from "@/server/checkout";
import { getSessionUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/env";
import { randomToken } from "@/lib/security/tokens";
import { noIndex } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/checkout">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).checkout.title, robots: noIndex };
}

export default async function CheckoutPage({ params }: PageProps<"/[locale]/checkout">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  if (!isServiceRoleConfigured()) {
    return (
      <Container className="py-16">
        <Alert tone="warning">{dict.common.notConfigured}</Alert>
      </Container>
    );
  }

  const cart = await getCartView(locale);
  const purchasable = cart.lines.filter((l) => l.purchasable);
  if (purchasable.length === 0 || cart.hasIssues) redirect(localizePath(locale, "/cart"));

  const [settings, shipping, user] = await Promise.all([loadSettingsFresh(), loadShippingFresh(), getSessionUser()]);

  let addresses: SavedAddress[] = [];
  let profile: { full_name: string | null; phone: string | null } | null = null;
  if (user) {
    const db = createServiceClient();
    const [addrRes, profileRes] = await Promise.all([
      db.from("addresses").select("*").eq("user_id", user.id).order("is_default", { ascending: false }).limit(10),
      db.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
    ]);
    profile = profileRes.data ?? null;
    addresses = (addrRes.data ?? []).map((a) => ({
      id: a.id,
      label: a.label,
      fullName: a.full_name,
      phone: a.phone,
      governorate: a.governorate,
      city: a.city,
      addressLine: a.address_line,
      notes: a.notes,
      isDefault: a.is_default,
    }));
  }

  return (
    <Container className="py-10 sm:py-14">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl sm:text-5xl">{dict.checkout.title}</h1>
        {!user ? (
          <Link
            href={`${localizePath(locale, "/account/login")}?next=${encodeURIComponent(localizePath(locale, "/checkout"))}`}
            className="link-underline text-sm"
          >
            {dict.checkout.signInPrompt}
          </Link>
        ) : null}
      </div>
      <CheckoutForm
        locale={locale}
        dict={dict}
        idempotencyKey={randomToken(24)}
        lines={purchasable.map((l) => ({
          variantId: l.variantId,
          name: l.name,
          variantName: l.variantName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        }))}
        coupon={cart.coupon}
        zones={shipping.zones}
        rates={shipping.rates}
        methods={enabledPaymentMethods(settings)}
        codFee={settings.codFee}
        codMaxTotal={settings.codMaxTotal}
        defaults={{ fullName: profile?.full_name ?? user?.fullName ?? "", email: user?.email ?? "", phone: profile?.phone ?? "" }}
        addresses={addresses}
        isSignedIn={Boolean(user)}
      />
    </Container>
  );
}
