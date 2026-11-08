/** Antwoord- en doorstuurmails (RE:, Antw:, FW:, Doorst: ...) zijn geen nieuwe aanvragen. */
const PREFIX = /^\s*(re|aw|antw|antwoord|sv|fw|fwd|wg|tr|doorst|doorgestuurd)\s*(\[\d+\])?\s*:/i;
export function isReplyMail(subject: string | null | undefined): boolean {
  return PREFIX.test(subject ?? "");
}
