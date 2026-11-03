/**
 * Tekstregelverdeler voor PDF-tekeningen.
 * Een regel mag nooit breder zijn dan de beschikbare kolom, anders loopt een titel
 * over in de prijs ernaast. Een woord dat op zichzelf al breder is dan de kolom wordt
 * daarom karakter per karakter opgebroken.
 */
export function fitText(measure: (line: string) => number, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const block of text.split(/\r?\n/)) {
    let cur = "";
    for (const word of block.split(" ")) {
      const cand = cur ? `${cur} ${word}` : word;
      if (measure(cand) > width && cur) {
        lines.push(cur);
        cur = word;
      } else cur = cand;
    }
    if (cur) lines.push(cur);
  }
  return lines.flatMap((line) => (measure(line) <= width ? [line] : breakWord(measure, line, width)));
}

/** Breekt een woord op in stukken die elk in de kolom passen. */
function breakWord(measure: (line: string) => number, line: string, width: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (measure(cur + ch) > width && cur) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
