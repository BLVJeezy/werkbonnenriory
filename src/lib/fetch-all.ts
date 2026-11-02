// De database geeft maximaal 1000 rijen per aanvraag terug; haal in blokken op tot alles binnen is.
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

// Grote overichten (bijv. alle journaalregels) kosten seconden als elk blok op zijn beurt wordt
// opgehaald. Vraag per salvo meerdere blokken tegelijk op; volgorde blijft van klein naar groot
// omdat elke query met dezelfde vaste sortering loopt.
export async function fetchAllParallel<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size = 1000,
  salvo = 8,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size * salvo) {
    const starts = Array.from({ length: salvo }, (_, i) => from + i * size);
    const results = await Promise.all(starts.map((s) => page(s, s + size - 1)));
    for (const r of results) {
      if (r.error) throw r.error;
      out.push(...(r.data ?? []));
    }
    if (results.some((r) => !r.data || r.data.length < size)) break;
  }
  return out;
}
