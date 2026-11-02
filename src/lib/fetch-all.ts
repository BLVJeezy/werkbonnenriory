// De database geeft maximaal 1000 rijen per aanvraag terug; haal in blokken op tot alles binnen is.
// Elke query loopt met dezelfde vaste sortering (order op id), zodat blokken elkaar nooit overlappen
// of overslaan — anders verdwijnen regels stil uit een overzicht.
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
