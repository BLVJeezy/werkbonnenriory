/** Crews log in with a name only; auth needs an email, so we derive a fixed internal one. */
export function loginEmail(input: string): string {
  const v = input.trim().toLowerCase();
  if (v.includes("@")) return v;
  const slug = v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}@ploeg.riory.local`;
}
