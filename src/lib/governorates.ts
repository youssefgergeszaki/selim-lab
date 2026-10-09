/** Egypt's 27 governorates. Codes are stored in orders and shipping zones. */
export const governorates = [
  { code: "cairo", ar: "القاهرة", en: "Cairo" },
  { code: "giza", ar: "الجيزة", en: "Giza" },
  { code: "qalyubia", ar: "القليوبية", en: "Qalyubia" },
  { code: "alexandria", ar: "الإسكندرية", en: "Alexandria" },
  { code: "beheira", ar: "البحيرة", en: "Beheira" },
  { code: "matrouh", ar: "مطروح", en: "Matrouh" },
  { code: "dakahlia", ar: "الدقهلية", en: "Dakahlia" },
  { code: "damietta", ar: "دمياط", en: "Damietta" },
  { code: "gharbia", ar: "الغربية", en: "Gharbia" },
  { code: "kafr-el-sheikh", ar: "كفر الشيخ", en: "Kafr El Sheikh" },
  { code: "monufia", ar: "المنوفية", en: "Monufia" },
  { code: "sharqia", ar: "الشرقية", en: "Sharqia" },
  { code: "port-said", ar: "بورسعيد", en: "Port Said" },
  { code: "ismailia", ar: "الإسماعيلية", en: "Ismailia" },
  { code: "suez", ar: "السويس", en: "Suez" },
  { code: "north-sinai", ar: "شمال سيناء", en: "North Sinai" },
  { code: "south-sinai", ar: "جنوب سيناء", en: "South Sinai" },
  { code: "faiyum", ar: "الفيوم", en: "Faiyum" },
  { code: "beni-suef", ar: "بني سويف", en: "Beni Suef" },
  { code: "minya", ar: "المنيا", en: "Minya" },
  { code: "asyut", ar: "أسيوط", en: "Asyut" },
  { code: "sohag", ar: "سوهاج", en: "Sohag" },
  { code: "qena", ar: "قنا", en: "Qena" },
  { code: "luxor", ar: "الأقصر", en: "Luxor" },
  { code: "aswan", ar: "أسوان", en: "Aswan" },
  { code: "red-sea", ar: "البحر الأحمر", en: "Red Sea" },
  { code: "new-valley", ar: "الوادي الجديد", en: "New Valley" },
] as const;

export type GovernorateCode = (typeof governorates)[number]["code"];

export const governorateCodes = governorates.map((g) => g.code) as unknown as readonly [
  GovernorateCode,
  ...GovernorateCode[],
];

export function governorateName(code: string, locale: "ar" | "en"): string {
  const found = governorates.find((g) => g.code === code);
  return found ? found[locale] : code;
}
