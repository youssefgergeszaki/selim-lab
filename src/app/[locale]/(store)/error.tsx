"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { getDictionary } from "@/i18n";
import { defaultLocale, isLocale, localizePath } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Container, EmptyState } from "@/components/ui/misc";

export default function StoreError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const params = useParams<{ locale: string }>();
  const locale = isLocale(params?.locale) ? params.locale : defaultLocale;
  const dict = getDictionary(locale);

  useEffect(() => {
    // Only the digest is logged client-side; details stay in server logs.
    console.error("page_error", error.digest ?? "");
  }, [error]);

  return (
    <Container className="py-24">
      <EmptyState
        title={dict.pages.errorTitle}
        body={dict.pages.errorBody}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => retry()}>{dict.pages.retry}</Button>
            <Button asChild variant="outline">
              <Link href={localizePath(locale, "/")}>{dict.pages.backHome}</Link>
            </Button>
          </div>
        }
      />
    </Container>
  );
}
