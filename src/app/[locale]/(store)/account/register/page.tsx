import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { AuthShell } from "@/components/account/auth-shell";
import { SignUpForm } from "@/components/account/auth-forms";
import { getSessionUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/security/redirect";
import { noIndex } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/register">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).auth.registerTitle, robots: noIndex };
}

export default async function RegisterPage({ params, searchParams }: PageProps<"/[locale]/account/register">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const next = safeNextPath((await searchParams).next, locale);
  if (await getSessionUser()) redirect(next);
  return (
    <AuthShell
      locale={locale}
      title={dict.auth.registerTitle}
      subtitle={dict.auth.registerSubtitle}
      footer={
        <>
          {dict.auth.haveAccount}{" "}
          <Link href={`${localizePath(locale, "/account/login")}?next=${encodeURIComponent(next)}`} className="link-underline text-deep">
            {dict.auth.signInTitle}
          </Link>
        </>
      }
    >
      <SignUpForm locale={locale} dict={dict} next={next} />
    </AuthShell>
  );
}
