import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { AddressForm } from "@/components/account/account-forms";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { createUserClient } from "@/lib/supabase/server";
import { governorateName } from "@/lib/governorates";
import { deleteAddress, setDefaultAddress } from "@/server/actions/account";
import { noIndex } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/addresses">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).account.addresses, robots: noIndex };
}

export default async function AddressesPage({ params }: PageProps<"/[locale]/account/addresses">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const supabase = await createUserClient();
  // RLS returns only the signed-in customer's addresses.
  const { data } = supabase
    ? await supabase.from("addresses").select("*").order("is_default", { ascending: false }).order("created_at")
    : { data: [] };
  const addresses = data ?? [];
  return (
    <div className="grid gap-12 xl:grid-cols-2">
      <section>
        <h2 className="mb-6 font-display text-2xl">{dict.account.addresses}</h2>
        {addresses.length === 0 ? (
          <p className="text-muted">{dict.account.noAddresses}</p>
        ) : (
          <ul className="space-y-4">
            {addresses.map((a) => (
              <li key={a.id} className="border border-line p-5 text-sm">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-medium">{a.label || a.full_name}</span>
                  {a.is_default ? <Badge tone="gold">{dict.account.default}</Badge> : null}
                </div>
                <p className="text-muted">{a.full_name}</p>
                <p className="text-muted">{a.address_line}</p>
                <p className="text-muted">
                  {a.city} — {governorateName(a.governorate, locale)}
                </p>
                <p className="ltr-nums text-muted">{a.phone}</p>
                <div className="mt-3 flex gap-4">
                  {!a.is_default ? (
                    <form action={setDefaultAddress}>
                      <input type="hidden" name="id" value={a.id} />
                      <Button type="submit" variant="link" size="sm" className="text-sm">
                        {dict.account.makeDefault}
                      </Button>
                    </form>
                  ) : null}
                  <form action={deleteAddress}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button type="submit" variant="link" size="sm" className="text-sm text-danger">
                      {dict.account.deleteAddress}
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-6 font-display text-2xl">{dict.account.addAddress}</h2>
        <AddressForm locale={locale} dict={dict} />
      </section>
    </div>
  );
}
