import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getAdminDictionary } from "@/i18n/admin";
import { AdminHeader, Table, Td, Th } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/server/admin/guard";
import { listAdminProducts, PAGE_SIZE } from "@/server/admin/data";

export default async function AdminProducts({ params, searchParams }: PageProps<"/[locale]/admin/products">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireStaffPage();
  const a = getAdminDictionary(locale);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = Number(sp.page ?? 1) || 1;
  const result = await listAdminProducts({ q, status, page });
  const base = localizePath(locale, "/admin/products");
  const qs = (p: number) => `${base}?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), page: String(p) })}`;

  return (
    <>
      <AdminHeader
        title={a.products.title}
        description={a.products.claimsNotice}
        action={
          <Button asChild>
            <Link href={`${base}/new`}>{a.products.new}</Link>
          </Button>
        }
      />
      <form className="mb-6 flex flex-wrap gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder={a.products.searchPlaceholder}
          aria-label={a.common.search}
          className="h-10 w-64 rounded-[var(--radius)] border border-line-strong/70 bg-ivory px-3 text-sm"
        />
        <select name="status" defaultValue={status} aria-label={a.products.statusLabel} className="h-10 rounded-[var(--radius)] border border-line-strong/70 bg-ivory px-3 text-sm">
          <option value="">{a.common.all}</option>
          {(["draft", "published", "archived"] as const).map((s) => (
            <option key={s} value={s}>
              {a.products.status[s]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="subtle">
          {a.common.filter}
        </Button>
      </form>
      {result.items.length === 0 ? (
        <p className="border border-line bg-ivory p-8 text-center text-muted">{a.common.empty}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th className="w-16" />
              <Th>{a.products.name}</Th>
              <Th>{a.products.statusLabel}</Th>
              <Th>{a.products.price}</Th>
              <Th>{a.products.available}</Th>
              <Th>{a.products.variants}</Th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((p) => (
              <tr key={p.id}>
                <Td>
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="h-14 w-11 object-cover" />
                  ) : (
                    <span className="block h-14 w-11 bg-surface-muted" />
                  )}
                </Td>
                <Td>
                  <Link href={`${base}/${p.id}`} className="font-medium hover:underline">
                    {(locale === "ar" ? p.nameAr : p.nameEn) || p.nameEn || p.nameAr}
                  </Link>
                  <p className="text-xs text-subtle">{locale === "ar" ? p.nameEn : p.nameAr}</p>
                </Td>
                <Td>
                  <Badge tone={p.status === "published" ? "success" : p.status === "draft" ? "neutral" : "warning"}>
                    {a.products.status[p.status as "draft"]}
                  </Badge>
                  {p.isFeatured ? <Badge tone="gold" className="ms-1">★</Badge> : null}
                </Td>
                <Td className="ltr-nums">{p.minPrice !== null ? formatMoney(p.minPrice, locale) : "—"}</Td>
                <Td className="ltr-nums">
                  <span className={p.available === 0 ? "text-danger" : ""}>{p.available}</span>
                </Td>
                <Td className="ltr-nums">{p.variantCount}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination
        page={result.page}
        pageCount={Math.ceil(result.total / PAGE_SIZE)}
        hrefFor={qs}
        labels={{ previous: a.common.previous, next: a.common.next, page: a.common.page, of: a.common.of }}
      />
    </>
  );
}
