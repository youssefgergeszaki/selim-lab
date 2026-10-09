import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getAdminDictionary } from "@/i18n/admin";
import { AdminHeader, CheckField, ImageField, Panel } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { createServiceClient } from "@/lib/supabase/server";
import { storageUrl } from "@/lib/storage";
import { requireStaffPage } from "@/server/admin/guard";
import { adminMessages } from "@/server/admin/messages";
import { SECTION_KEYS } from "@/server/admin/constants";
import { saveHomepageSection } from "@/server/actions/admin/content";

const FIELDS = ["eyebrow", "title", "body", "cta_label", "cta_href"] as const;

export default async function AdminContent({ params }: PageProps<"/[locale]/admin/content">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireStaffPage();
  const a = getAdminDictionary(locale);
  const messages = adminMessages(a);
  const { data } = await createServiceClient().from("homepage_sections").select("*");
  const byKey = new Map((data ?? []).map((s) => [s.key, s]));
  const label = { eyebrow: a.content.eyebrow, title: a.content.heading, body: a.content.body, cta_label: a.content.ctaLabel, cta_href: a.content.ctaHref };
  const input = "w-full rounded-[var(--radius)] border border-line-strong/70 bg-surface px-3 py-2 text-sm";
  return (
    <>
      <AdminHeader title={a.content.title} description={a.content.hint} />
      <div className="space-y-6">
        {SECTION_KEYS.map((key) => {
          const section = byKey.get(key);
          const content = (section?.content ?? {}) as Record<"ar" | "en", Record<string, string>>;
          const imageUrl = storageUrl("site-media", section?.image_path);
          const usesImage = key === "hero" || key === "brand_story";
          return (
            <Panel key={key} title={a.content.sections[key]}>
              <ActionForm action={saveHomepageSection} submitLabel={a.common.save} pendingLabel={a.common.saving} messages={messages} variant="subtle">
                <input type="hidden" name="key" value={key} />
                <CheckField id="is_active" label={a.common.active} defaultChecked={section?.is_active ?? true} />
                <div className="grid gap-6 md:grid-cols-2">
                  {(["ar", "en"] as const).map((l) => (
                    <fieldset key={l} className="space-y-3" lang={l} dir={l === "ar" ? "rtl" : "ltr"}>
                      <legend className="eyebrow mb-1">{l === "ar" ? a.common.arabic : a.common.english}</legend>
                      {FIELDS.filter((f) => key === "hero" || (f !== "cta_label" && f !== "cta_href")).map((f) => (
                        <div key={f}>
                          <label htmlFor={`${key}-${f}-${l}`} className="mb-1 block text-xs font-medium">{label[f]}</label>
                          {f === "body" ? (
                            <textarea id={`${key}-${f}-${l}`} name={`${f}_${l}`} rows={4} maxLength={3000} defaultValue={content?.[l]?.[f] ?? ""} className={input} />
                          ) : (
                            <input id={`${key}-${f}-${l}`} name={`${f}_${l}`} maxLength={f === "cta_href" ? 300 : 200} dir={f === "cta_href" ? "ltr" : undefined} defaultValue={content?.[l]?.[f] ?? ""} className={`${input} h-10`} />
                          )}
                        </div>
                      ))}
                    </fieldset>
                  ))}
                </div>
                {usesImage ? (
                  <div className="space-y-2">
                    <ImageField id="image" label={a.common.image} hint={a.common.imageHint} currentUrl={imageUrl} />
                    {imageUrl ? <CheckField id="remove_image" label={a.common.removeImage} /> : null}
                  </div>
                ) : null}
              </ActionForm>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
