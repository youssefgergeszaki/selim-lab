import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getDictionary, t } from "@/i18n";
import { Breadcrumbs, Container, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { ProductCard, ProductGrid } from "@/components/product/product-card";
import { getCatalogSize, getCategories, listProducts, sortKeys, type SortKey } from "@/server/catalog";
import { getStoreSettings } from "@/server/content";
import { alternatesFor } from "@/lib/seo";
import { cn } from "@/lib/utils";

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilters(sp: SearchParams) {
  const q = (one(sp.q) ?? "").trim().slice(0, 80);
  const category = (one(sp.category) ?? "").trim().slice(0, 100);
  const sortRaw = one(sp.sort) as SortKey | undefined;
  const sort: SortKey = sortRaw && sortKeys.includes(sortRaw) ? sortRaw : "featured";
  const page = Math.min(Math.max(Number.parseInt(one(sp.page) ?? "1", 10) || 1, 1), 500);
  const inStock = one(sp.stock) === "1";
  return { q, category, sort, page, inStock };
}

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/shop">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);
  const filters = parseFilters(await searchParams);
  const filtered = Boolean(filters.q || filters.inStock || filters.page > 1 || filters.sort !== "featured");
  let title = dict.shop.title;
  if (filters.category) {
    const category = (await getCategories(locale)).find((c) => c.slug === filters.category);
    if (category) title = category.name;
  }
  return {
    title,
    description: dict.shop.description,
    alternates: alternatesFor(locale, filters.category ? `/shop?category=${encodeURIComponent(filters.category)}` : "/shop"),
    // Search/sort/pagination variants are crawlable but not indexed as separate pages.
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ params, searchParams }: PageProps<"/[locale]/shop">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const filters = parseFilters(await searchParams);

  const [categories, result, settings] = await Promise.all([
    getCategories(locale),
    listProducts({
      locale,
      query: filters.q,
      categorySlug: filters.category || undefined,
      sort: filters.sort,
      inStockOnly: filters.inStock,
      page: filters.page,
      pageSize: 12,
    }),
    getStoreSettings(),
  ]);
  const activeCategory = categories.find((c) => c.slug === filters.category);
  const catalogSize = result.total === 0 ? await getCatalogSize() : result.total;

  const base = localizePath(locale, "/shop");
  const buildHref = (overrides: Partial<{ q: string; category: string; sort: string; page: number; stock: boolean }>) => {
    const next = { ...filters, ...overrides };
    const qs = new URLSearchParams();
    if (next.q) qs.set("q", next.q);
    if (next.category) qs.set("category", next.category);
    if (next.sort && next.sort !== "featured") qs.set("sort", next.sort);
    if (overrides.stock ?? filters.inStock) qs.set("stock", "1");
    if (next.page && next.page > 1) qs.set("page", String(next.page));
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  };

  const groups = [
    { title: dict.shop.categories, items: categories.filter((c) => c.kind === "category") },
    { title: dict.shop.collections, items: categories.filter((c) => c.kind === "collection") },
  ].filter((g) => g.items.length > 0);

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: "featured", label: dict.shop.sort.featured },
    { value: "newest", label: dict.shop.sort.newest },
    { value: "price-asc", label: dict.shop.sort.priceAsc },
    { value: "price-desc", label: dict.shop.sort.priceDesc },
  ];

  return (
    <Container className="py-10 sm:py-14">
      <Breadcrumbs
        label={dict.common.breadcrumb}
        items={[
          { label: dict.common.home, href: localizePath(locale, "/") },
          activeCategory ? { label: dict.shop.title, href: base } : { label: dict.shop.title },
          ...(activeCategory ? [{ label: activeCategory.name }] : []),
        ]}
      />
      <header className="mt-8 mb-10 border-b border-line pb-8">
        <h1 className="font-display text-4xl sm:text-5xl">{activeCategory?.name ?? dict.shop.title}</h1>
        {activeCategory?.description ? <p className="mt-3 max-w-2xl text-muted">{activeCategory.description}</p> : null}
        {filters.q ? <p className="mt-3 text-muted">{t(dict.shop.resultsFor, { query: filters.q })}</p> : null}
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
        <aside aria-label={dict.shop.filters} className="space-y-8">
          <form action={base} method="get" role="search">
            <label htmlFor="shop-q" className="eyebrow mb-3 block">
              {dict.shop.searchLabel}
            </label>
            {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
            {filters.sort !== "featured" ? <input type="hidden" name="sort" value={filters.sort} /> : null}
            <div className="flex border-b border-line-strong focus-within:border-deep">
              <input
                id="shop-q"
                name="q"
                type="search"
                defaultValue={filters.q}
                maxLength={80}
                placeholder={dict.nav.searchPlaceholder}
                className="h-10 w-full bg-transparent text-sm focus:outline-none"
              />
              <button type="submit" className="px-2 text-sm text-muted hover:text-deep">
                {dict.common.search}
              </button>
            </div>
          </form>

          {groups.map((group) => (
            <div key={group.title}>
              <h2 className="eyebrow mb-3">{group.title}</h2>
              <ul className="space-y-1.5 text-sm">
                {group === groups[0] ? (
                  <li>
                    <Link
                      href={buildHref({ category: "", page: 1 })}
                      aria-current={!filters.category ? "page" : undefined}
                      className={cn("block py-0.5 hover:text-deep", !filters.category ? "font-medium text-deep" : "text-muted")}
                    >
                      {dict.shop.allProducts}
                    </Link>
                  </li>
                ) : null}
                {group.items.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={buildHref({ category: c.slug, page: 1 })}
                      aria-current={filters.category === c.slug ? "page" : undefined}
                      className={cn(
                        "block py-0.5 hover:text-deep",
                        filters.category === c.slug ? "font-medium text-deep" : "text-muted",
                      )}
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <Link
              href={buildHref({ stock: !filters.inStock, page: 1 })}
              className="flex items-center gap-2 text-sm text-muted hover:text-deep"
            >
              <span
                aria-hidden="true"
                className={cn("inline-block size-4 border border-line-strong", filters.inStock && "border-deep bg-deep")}
              />
              {dict.shop.inStockOnly}
            </Link>
          </div>
        </aside>

        <section aria-label={dict.shop.title}>
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted">{t(dict.shop.productsCount, { count: result.total })}</p>
            <form action={base} method="get" className="flex items-center gap-2">
              {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
              {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
              {filters.inStock ? <input type="hidden" name="stock" value="1" /> : null}
              <label htmlFor="shop-sort" className="text-sm text-muted">
                {dict.shop.sortBy}
              </label>
              <Select id="shop-sort" name="sort" defaultValue={filters.sort} className="h-10 w-auto min-w-44 text-sm">
                {sortOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="subtle" size="sm">
                {dict.shop.apply}
              </Button>
            </form>
          </div>

          {result.items.length > 0 ? (
            <>
              <ProductGrid>
                {result.items.map((p, i) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    locale={locale}
                    dict={dict}
                    lowStockThreshold={settings.lowStockThreshold}
                    eager={i < 4}
                  />
                ))}
              </ProductGrid>
              <Pagination
                page={result.page}
                pageCount={result.pageCount}
                hrefFor={(p) => buildHref({ page: p })}
                labels={{ previous: dict.common.previous, next: dict.common.next, page: dict.common.page, of: dict.common.of }}
              />
            </>
          ) : catalogSize === 0 && !filters.q && !filters.category ? (
            <EmptyState title={dict.shop.emptyCatalogTitle} body={dict.shop.emptyCatalogBody} />
          ) : (
            <EmptyState
              title={dict.shop.emptyTitle}
              body={dict.shop.emptyBody}
              action={
                <Button asChild variant="outline">
                  <Link href={base}>{dict.shop.clear}</Link>
                </Button>
              }
            />
          )}
        </section>
      </div>
    </Container>
  );
}
