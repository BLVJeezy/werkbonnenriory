import { supabase } from "@/integrations/supabase/client";
import { photoFileName, photoFolderName, photoZipName, uniqueEntryName, type PhotoSource } from "./photo-naming";

export const PHOTO_BUCKET = "werkbon-fotos";

export type PhotoRef = { id: string; path: string };
export type DownloadGroup = PhotoSource & { id: string; photos: PhotoRef[] };
export type PreparedFile = { blob: Blob; filename: string };

/** Photo bytes read with the signed-in user's own session, so RLS decides. */
export async function fetchPhoto(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(path);
  if (error || !data) throw new Error("Een foto kon niet geladen worden");
  return data;
}

/** Runs `fn` over `items` with at most `limit` in flight, reporting progress. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<Blob>, onDone: () => void): Promise<Blob[]> {
  const out: Blob[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      onDone();
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Bundles photo's into a ZIP: one folder per intervention, files named after the
 * customer instead of the storage UUID. JSZip is loaded on demand because it is
 * browser-only and not needed to render the page.
 */
export async function buildPhotoZip(groups: DownloadGroup[], onProgress: (done: number, total: number) => void): Promise<PreparedFile> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set<string>();
  const total = groups.reduce((sum, g) => sum + g.photos.length, 0);
  let done = 0;
  for (const g of groups) {
    const folder = photoFolderName(g);
    const blobs = await mapLimit(g.photos, 4, fetchPhoto, () => onProgress(++done, total));
    g.photos.forEach((photo, i) => zip.file(uniqueEntryName(`${folder}/${photoFileName(g, i, photo.path)}`, used), blobs[i]));
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  return { blob, filename: photoZipName(groups) };
}

/** One photo arrives as a plain image, a whole intervention as a ZIP. */
export async function prepareGroupDownload(group: DownloadGroup, onProgress: (done: number, total: number) => void): Promise<PreparedFile> {
  if (group.photos.length === 1) {
    onProgress(0, 1);
    const blob = await fetchPhoto(group.photos[0].path);
    onProgress(1, 1);
    return { blob, filename: photoFileName(group, 0, group.photos[0].path) };
  }
  return buildPhotoZip([group], onProgress);
}
