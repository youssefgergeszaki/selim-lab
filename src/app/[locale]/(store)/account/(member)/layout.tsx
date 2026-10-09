import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { Container } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/server/actions/auth";

/** Every page in this group requires a signed-in customer (verified on the server). */
export default async function MemberLayout({ children, params }: LayoutProps<"/[locale]/account">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  await requireUser(locale, localizePath(locale, "/account"));
  const nav = [
    { href: localizePath(locale, "/account"), label: dict.account.orders },
    { href: localizePath(locale, "/account/profile"), label: dict.account.profile },
    { href: localizePath(locale, "/account/addresses"), label: dict.account.addresses },
  ];
  return (
    <Container className="py-10 sm:py-14">
      <h1 className="font-display text-4xl sm:text-5xl">{dict.account.title}</h1>
      <div className="hairline my-8" aria-hidden="true" />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[200px_1fr]">
        <nav aria-label={dict.account.title}>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm lg:flex-col">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-muted hover:text-deep">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <form action={signOut}>
                <input type="hidden" name="locale" value={locale} />
                <Button type="submit" variant="link" className="text-sm text-muted">
                  {dict.auth.signOut}
                </Button>
              </form>
            </li>
          </ul>
        </nav>
        <div>{children}</div>
      </div>
    </Container>
  );
}
