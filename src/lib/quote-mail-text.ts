import type { InvoiceLine } from "./invoice";

/** Pure: mailtekst van een verzonden offerte/bestek.
 *  De uitleg dat de prijs pas definitief is na het maken van een keuze verschijnt enkel wanneer de offerte keuzemogelijkheden bevat. */
export function quoteMailText(opts: {
  kind?: string | null;
  number: string;
  customerName: string;
  link: string;
  lines: InvoiceLine[];
}) {
  const what = opts.kind === "verzekering" ? "het bestek voor uw verzekering" : "offerte";
  const hasOptions = opts.lines.some((l) => l.optional);
  const paragraphs = [
    `Beste ${opts.customerName},`,
    `In de bijlage vindt u ${what} ${opts.number}.`,
  ];
  if (hasOptions) {
    paragraphs.push(
      "Op deze offerte staan aparte keuzemogelijkheden. De prijs is pas definitief nadat u heeft aangegeven welke mogelijkheden u neemt.",
    );
  }
  paragraphs.push(`Akkoord? Onderteken de offerte via deze link:\n${opts.link}`);
  paragraphs.push("Met vriendelijke groeten,\nRiory");
  return paragraphs.join("\n\n");
}
