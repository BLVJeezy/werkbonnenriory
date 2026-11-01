export const PRODUCT_PHOTO_BUCKET = "product-fotos";

export function validProductPhotoPath(path: unknown): path is string {
  return typeof path === "string" && /^[0-9a-f-]{36}\.(jpg|png)$/.test(path);
}

export function productPhotoPaths(paths: unknown): string[] {
  return Array.isArray(paths) ? [...new Set(paths.filter(validProductPhotoPath))] : [];
}

/** Copy the photo selection so later catalogue edits never change a saved quote. */
export function quoteProductValues(p: { name: string; description?: string | null; unit: string; price: number; photo_paths?: string[] }) {
  return { title: p.name, detail: (p.description ?? "").trim(), unit: p.unit, unitPrice: String(p.price), photoPaths: productPhotoPaths(p.photo_paths) };
}