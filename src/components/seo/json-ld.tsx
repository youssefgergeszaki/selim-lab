/** Renders JSON-LD safely (escapes "<" so content can never close the script tag). */
const LINE_SEPARATORS = new RegExp("[" + String.fromCharCode(0x2028) + String.fromCharCode(0x2029) + "]", "g");

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(LINE_SEPARATORS, " ");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
