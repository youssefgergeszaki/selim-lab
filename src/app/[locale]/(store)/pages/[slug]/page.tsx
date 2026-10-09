import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { Breadcrumbs, Container } from "@/components/ui/misc";
import { getContentPage } from "@/server/content";
import { alternatesFor } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/pages/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !/^[a-z0-9-]{1,100}$/.test(slug)) return {};
  const page = await getContentPage(locale, slug);
  if (!page) return {};
  return { title: page.title, alternates: alternatesFor(locale, `/pages/${slug}`) };
}

/** Policy and information pages managed from the dashboard (plain text, rendered safely). */
export default async function ContentPage({ params }: PageProps<"/[locale]/pages/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !/^[a-z0-9-]{1,100}$/.test(slug)) notFound();
  const dict = getDictionary(locale);
  const page = await getContentPage(locale, slug);
  if (!page) notFound();
  return (
    <Container className="max-w-3xl py-10 sm:py-14">
      <Breadcrumbs label={dict.common.breadcrumb} items={[{ label: dict.common.home, href: localizePath(locale, "/") }, { label: page.title }]} />
      <h1 className="mt-8 font-display text-4xl sm:text-5xl">{page.title}</h1>
      <div className="hairline my-8" aria-hidden="true" />
      <article className="prose-brand text-[1.02rem]">{page.body}</article>
    </Container>
  );
}
