export type ContractSourceRow = Record<string, string | number | null>;

/** Keep only explicitly started contracts and preserve each original line. */
export function startedContracts(rows: ContractSourceRow[]) {
  const groups = new Map<string, ContractSourceRow[]>();
  for (const row of rows) {
    if (String(row["status"] ?? "").trim().toLowerCase() !== "gestart") continue;
    const number = String(row["contractnummer"] ?? "").trim();
    if (!number) continue;
    groups.set(number, [...(groups.get(number) ?? []), row]);
  }
  return [...groups].map(([number, lines]) => ({ number, lines }));
}