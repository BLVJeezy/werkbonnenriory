/** Customer mail must never point at localhost or an editor-only preview. */
export function werkbonSigningLink(workOrderId: string): string {
  return `https://werkbonnenriory.lovable.app/werkbon-tekenen/${encodeURIComponent(workOrderId)}`;
}
