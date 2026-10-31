/**
 * A document line stores its product name and its long description in one text field:
 * the first line is the name, everything below it is the annex ("bijvoegsel").
 */
export type LineText = { title: string; detail: string | null };

/** Splits one document line into the product name and the long description below it. */
export function splitLineText(description: string): LineText {
  const text = description.replace(/\r\n?/g, "\n").trim();
  if (!text) return { title: "", detail: null };
  const cut = text.indexOf("\n");
  if (cut < 0) return { title: text, detail: null };
  const detail = text.slice(cut + 1).trim();
  return { title: text.slice(0, cut).trim(), detail: detail || null };
}
