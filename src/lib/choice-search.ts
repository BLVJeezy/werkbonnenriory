export type SearchChoice = { value: string; label: string; search?: string };

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Keep the source order, matching every word across the searchable fields. */
export function filterChoices(options: SearchChoice[], query: string) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return options.filter(option => {
    const text = normalize(`${option.label} ${option.search ?? ""}`);
    return words.every(word => text.includes(word));
  });
}