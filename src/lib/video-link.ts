/** Customer video links must never point at localhost or an editor-only preview. */
export function customerVideoLink(token: string): string {
  return `https://werkbonnenriory.lovable.app/video/${encodeURIComponent(token)}`;
}
