import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { ProfileForm } from "@/components/account/account-forms";
import { getSessionUser } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { noIndex } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/profile">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).account.profile, robots: noIndex };
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/account/profile">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const user = await getSessionUser();
  const supabase = await createUserClient();
  const { data } = supabase && user
    ? await supabase.from("profiles").select("full_name, phone, preferred_locale, marketing_opt_in").eq("id", user.id).maybeSingle()
    : { data: null };
  return (
    <section>
      <h2 className="mb-6 font-display text-2xl">{dict.account.profile}</h2>
      <ProfileForm
        dict={dict}
        profile={{
          email: user?.email ?? "",
          fullName: data?.full_name ?? user?.fullName ?? "",
          phone: data?.phone ?? "",
          preferredLocale: data?.preferred_locale === "en" ? "en" : "ar",
          marketingOptIn: Boolean(data?.marketing_opt_in),
        }}
      />
    </section>
  );
}
