import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { AuthShell } from "@/components/account/auth-shell";
import { ResetPasswordForm } from "@/components/account/auth-forms";
import { Alert } from "@/components/ui/misc";
import { getSessionUser } from "@/lib/auth";
import { noIndex } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/reset-password">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).auth.resetTitle, robots: noIndex };
}

/** Reached from the recovery email link (via /auth/confirm, which establishes the session). */
export default async function ResetPasswordPage({ params }: PageProps<"/[locale]/account/reset-password">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const user = await getSessionUser();
  return (
    <AuthShell locale={locale} title={dict.auth.resetTitle}>
      {user ? (
        <ResetPasswordForm locale={locale} dict={dict} />
      ) : (
        <div className="space-y-6">
          <Alert tone="danger">{dict.auth.linkInvalid}</Alert>
          <Link href={localizePath(locale, "/account/forgot-password")} className="link-underline text-sm">
            {dict.auth.forgotTitle}
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
