/**
 * File names for downloaded werkbon photo's.
 *
 * Storage paths are `<work-order-id>/<uuid>.jpg`, which tells marketing nothing.
 * Downloaded files are named after the intervention instead: number, customer,
 * place and date, so a marketing folder stays searchable.
 */

export type PhotoSource = {
  number: number | null;
  customer: string;
  city?: string | null;
  date?: string | null;
};

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "bmp", "tif", "tiff"]);

/** Lowercase, accent-free, filesystem-safe; "Mario  O'Brien" → "mario-obrien". */
export function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Extension of a storage path; anything unexpected is treated as a photo. */
export function extFromPath(path: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(path.trim())?.[1]?.toLowerCase() ?? "";
  return ALLOWED_EXT.has(ext) ? ext : "jpg";
}

/** Folder/file prefix for one intervention: "wb-101-mario-franceschi-bilzen-2026-10-15". */
export function photoFolderName(source: PhotoSource): string {
  return [
    source.number ? `wb-${source.number}` : "wb-nieuw",
    slug(source.customer) || "klant",
    source.city ? slug(source.city) : "",
    source.date ? slug(source.date) : "",
  ]
    .filter(Boolean)
    .join("-");
}

/** "wb-101-mario-franceschi-bilzen-2026-10-15-01.jpg" */
export function photoFileName(source: PhotoSource, index: number, pathOrExt: string): string {
  return `${photoFolderName(source)}-${String(index + 1).padStart(2, "0")}.${extFromPath(pathOrExt)}`;
}

/** Keeps a ZIP entry unique by adding "-2", "-3", … before the extension. */
export function uniqueEntryName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  while (used.has(`${base}-${n}${ext}`)) n++;
  const unique = `${base}-${n}${ext}`;
  used.add(unique);
  return unique;
}

/** "riory-fotos-wb-101-mario-franceschi-bilzen-2026-10-15.zip" / "riory-fotos-3-interventies.zip" */
export function photoZipName(sources: PhotoSource[]): string {
  const only = sources[0];
  if (sources.length === 1 && only) return `riory-fotos-${photoFolderName(only)}.zip`;
  return `riory-fotos-${sources.length}-interventies.zip`;
}
