/** Editable homepage sections (keys stored in public.homepage_sections). */
export const SECTION_KEYS = ["hero", "collections", "philosophy", "ingredients", "brand_story", "newsletter"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
