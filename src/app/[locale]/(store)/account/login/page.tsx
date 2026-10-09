import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { AuthShell } from "@/components/account/auth-shell";
import { SignInForm } from "@/components/account/auth-forms";
import { Alert } from "@/components/ui/misc";
import { getSessionUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/security/redirect";
import { noIndex } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/login">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).auth.signInTitle, robots: noIndex };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/account/login">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const sp = await searchParams;
  const next = safeNextPath(sp.next, locale);
  if (await getSessionUser()) redirect(next);
  return (
    <AuthShell
      locale={locale}
      title={dict.auth.signInTitle}
      subtitle={dict.auth.signInSubtitle}
      footer={
        <>
          {dict.auth.noAccount}{" "}
          <Link href={`${localizePath(locale, "/account/register")}?next=${encodeURIComponent(next)}`} className="link-underline text-deep">
            {dict.auth.registerTitle}
          </Link>
        </>
      }
    >
      {sp.error === "link_invalid" ? (
        <Alert tone="danger" className="mb-6">
          {dict.auth.linkInvalid}
        </Alert>
      ) : null}
      <SignInForm locale={locale} dict={dict} next={next} />
    </AuthShell>
  );
}
