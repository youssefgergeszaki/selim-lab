import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { Container, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";

export async function generateMetadata({ params }: PageProps<"/[locale]/track-order">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).pages.trackTitle, robots: { index: false, follow: true } };
}

/**
 * Orders are private: they can be opened with the secret link shown after checkout, or from the
 * customer's account. There is deliberately no lookup by order number alone.
 */
export default async function TrackOrderPage({ params }: PageProps<"/[locale]/track-order">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (await getSessionUser()) redirect(localizePath(locale, "/account"));
  const dict = getDictionary(locale);
  return (
    <Container className="py-20">
      <EmptyState
        title={dict.pages.trackTitle}
        body={dict.pages.trackBody}
        action={
          <Button asChild>
            <Link href={`${localizePath(locale, "/account/login")}?next=${encodeURIComponent(localizePath(locale, "/account"))}`}>
              {dict.nav.signIn}
            </Link>
          </Button>
        }
      />
    </Container>
  );
}
