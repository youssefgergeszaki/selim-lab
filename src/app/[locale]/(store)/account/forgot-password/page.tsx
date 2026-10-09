import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { AuthShell } from "@/components/account/auth-shell";
import { ForgotPasswordForm } from "@/components/account/auth-forms";
import { noIndex } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/forgot-password">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).auth.forgotTitle, robots: noIndex };
}

export default async function ForgotPasswordPage({ params }: PageProps<"/[locale]/account/forgot-password">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  return (
    <AuthShell
      locale={locale}
      title={dict.auth.forgotTitle}
      subtitle={dict.auth.forgotSubtitle}
      footer={
        <Link href={localizePath(locale, "/account/login")} className="link-underline text-deep">
          {dict.auth.signInTitle}
        </Link>
      }
    >
      <ForgotPasswordForm locale={locale} dict={dict} />
    </AuthShell>
  );
}
