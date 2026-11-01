/**
 * Browser-side file delivery.
 *
 * The caller must have the Blob ready before the click: user activation is lost
 * after a long `await`, and iOS drops it fastest. So prepare first, then let the
 * Download button call `deliverFile` synchronously.
 */

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the transfer in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Downloads the file; on phones the share sheet is offered first ("Save to Files"). */
export async function deliverFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  downloadBlob(blob, filename);
}
