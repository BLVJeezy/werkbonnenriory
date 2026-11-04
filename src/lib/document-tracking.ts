export type DocumentType = 'factuur' | 'creditnota' | 'offerte' | 'werkbon' | 'herinnering';
export const documentLink = (token: string) => `https://werkbonnenriory.lovable.app/document/${encodeURIComponent(token)}`;
/** Pixel URL derived from a document link (same token). */
export const openPixelUrl = (docUrl: string) => {
  const m = /\/document\/([^/?#]+)$/.exec(docUrl);
  return m ? `https://werkbonnenriory.lovable.app/api/public/mail-open/${m[1]}.gif` : null;
};
export function linkText(content: string, url: string) {
  return `${content}\n\nDocument openen:\n${url}\n\nBij openen via deze link wordt het tijdstip geregistreerd voor documentopvolging.`;
}
export function mayOpenDocument(status: string, expires: string, now = Date.now()) {
  return (status === 'accepted' || status === 'uncertain') && Date.parse(expires) > now;
}
export async function tokenHash(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}