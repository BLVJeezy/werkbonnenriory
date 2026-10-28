/** Customer mail must never point at localhost or an editor-only preview. */
export function quoteSigningLink(token: string): string {
  return `https://werkbonnenriory.lovable.app/offerte/${encodeURIComponent(token)}`;
}