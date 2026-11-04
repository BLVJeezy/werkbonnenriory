/** Dagen na verzending waarop een herinnering vertrekt (stap 1 en 2). */
export const QUOTE_REMINDER_DAYS = [7, 10] as const;

/** Pure: welke herinneringsstap nu verschuldigd is, of null. Enkel voor verzonden, niet-ondertekende offertes. */
export function dueQuoteReminder(q: { status: string; sent_at: string | null; reminder_stage: number; kind?: string | null }, now: Date): 1 | 2 | null {
  if (q.status !== "verzonden" || !q.sent_at) return null;
  const days = (now.getTime() - new Date(q.sent_at).getTime()) / 86_400_000;
  const stage = q.reminder_stage ?? 0;
  if (stage >= QUOTE_REMINDER_DAYS.length) return null;
  // Na een gemiste dag nooit twee herinneringen tegelijk: steeds de eerstvolgende stap.
  return days >= QUOTE_REMINDER_DAYS[stage] ? ((stage + 1) as 1 | 2) : null;
}

/** Pure: mailtekst van de herinnering in de huisstijl-opmaak ("! " = kader, "✓ " = vinkjes). */
export function quoteReminderText(o: { stage: 1 | 2; kind?: string | null; number: string; customerName: string; link: string; validUntil: string }) {
  const doc = o.kind === "verzekering" ? "het bestek" : "de offerte";
  const Doc = o.kind === "verzekering" ? "Bestek" : "Offerte";
  const until = new Date(`${o.validUntil}T12:00:00Z`).toLocaleDateString("nl-BE", { day: "numeric", month: "long", year: "numeric" });
  const p = [`Beste ${o.customerName},`];
  if (o.stage === 1) {
    p.push(`Een week geleden bezorgden we u ${doc} ${o.number}. We horen graag of alles duidelijk is.`);
  } else {
    p.push(`We willen u nog even herinneren aan ${doc} ${o.number}. Zo kunnen we uw werk tijdig inplannen.`);
    p.push(`! ${Doc} ${o.number} is geldig tot ${until}.`);
  }
  p.push(`Akkoord? Onderteken ${doc} online in minder dan een minuut:\n${o.link}`);
  p.push(["✓ Online ondertekenen, zonder printen of scannen", "✓ Na uw akkoord plannen we snel een afspraak in", "✓ Vragen of iets aanpassen? Antwoord gewoon op deze mail"].join("\n"));
  p.push("Heeft u ondertussen al beslist of wenst u geen verdere opvolging? Laat het ons gerust weten.");
  p.push("Met vriendelijke groeten,\nRiory");
  return p.join("\n\n");
}
