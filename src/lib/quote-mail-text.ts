import type { InvoiceLine } from "./invoice";

/** Pure: mailtekst van een verzonden offerte/bestek.
 *  De uitleg dat de prijs pas definitief is na het maken van een keuze verschijnt enkel wanneer de offerte keuzemogelijkheden bevat.
 *  Regels met "! " worden in de huisstijl een opvallend kader, regels met "✓ " een vinkjeslijst. */
export function quoteMailText(opts: {
  kind?: string | null;
  number: string;
  customerName: string;
  link: string;
  lines: InvoiceLine[];
}) {
  const insurance = opts.kind === "verzekering";
  const what = insurance ? "het bestek voor uw verzekering" : "offerte";
  const doc = insurance ? "het bestek" : "de offerte";
  const hasOptions = opts.lines.some((l) => l.optional);
  const paragraphs = [
    `Beste ${opts.customerName},`,
    `Bedankt voor uw aanvraag. In de bijlage vindt u ${what} ${opts.number}.`,
  ];
  if (hasOptions) {
    paragraphs.push(
      "! Op deze offerte staan aparte keuzemogelijkheden. De prijs is pas definitief nadat u heeft aangegeven welke mogelijkheden u neemt.",
    );
  }
  paragraphs.push(`Akkoord? Onderteken ${doc} online in minder dan een minuut:\n${opts.link}`);
  paragraphs.push(
    [
      hasOptions ? "✓ Vink online aan welke keuzemogelijkheden u wenst" : "✓ Online ondertekenen, zonder printen of scannen",
      "✓ Na uw akkoord plannen we snel een afspraak in",
      "✓ Vragen? Antwoord gewoon op deze mail",
    ].join("\n"),
  );
  paragraphs.push("Met vriendelijke groeten,\nRiory");
  return paragraphs.join("\n\n");
}
