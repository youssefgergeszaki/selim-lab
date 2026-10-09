import Link from "next/link";
import { headers } from "next/headers";
import { getDictionary } from "@/i18n";
import { defaultLocale, isLocale, localizePath } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Container, EmptyState } from "@/components/ui/misc";

export default async function NotFound() {
  // not-found.tsx does not receive params; the proxy forwards the resolved locale.
  const lang = (await headers()).get("x-sl-locale");
  const locale = isLocale(lang) ? lang : defaultLocale;
  const dict = getDictionary(locale);
  return (
    <Container className="py-24">
      <EmptyState
        title={dict.pages.notFoundTitle}
        body={dict.pages.notFoundBody}
        action={
          <Button asChild>
            <Link href={localizePath(locale, "/")}>{dict.pages.backHome}</Link>
          </Button>
        }
      />
    </Container>
  );
}
