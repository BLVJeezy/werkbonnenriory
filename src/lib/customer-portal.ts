export const PORTAL_BASE_URL = "https://werkbonnen.riory.be";
export const RIORY_WEBSITE_URL = "https://www.riory.be";
export const PORTAL_PASSWORD_MESSAGE = "Kies een wachtwoord van minstens 8 tekens.";
export const PORTAL_INVITE_TTL_HOURS = 72;

export function buildPortalInviteUrl(token: string): string {
  return `${PORTAL_BASE_URL}/portaal/uitnodiging#${token}`;
}

/**
 * Only allow relative paths inside /portaal to prevent open-redirect attacks
 * when external sites (such as riory.be) link to /portaal/inloggen?next=...
 */
export function sanitizePortalNext(next: string | null | undefined): string {
  if (!next) return "/portaal";
  const trimmed = next.trim();
  if (!trimmed.startsWith("/portaal")) return "/portaal";
  if (trimmed.startsWith("//") || trimmed.includes("\\")) return "/portaal";
  if (trimmed.startsWith("/portaal/inloggen") || trimmed.startsWith("/portaal/uitnodiging")) {
    return "/portaal";
  }
  return trimmed;
}

export function portalInvitationUsable(
  inv: { expires_at: string; consumed_at: string | null },
  now = new Date(),
): boolean {
  if (inv.consumed_at) return false;
  return new Date(inv.expires_at).getTime() > now.getTime();
}

export type PortalAppointmentInput = {
  description: string;
  preferredWindow?: string | undefined;
  contactPhone?: string | undefined;
  urgent?: boolean | undefined;
};

export function buildPortalAppointmentDescription(input: PortalAppointmentInput): string {
  const parts: string[] = [input.description.trim()];
  if (input.preferredWindow?.trim()) {
    parts.push(`Voorkeur moment: ${input.preferredWindow.trim()}`);
  }
  if (input.contactPhone?.trim()) {
    parts.push(`Contacttelefoon aanvraag: ${input.contactPhone.trim()}`);
  }
  if (input.urgent) {
    parts.push("Aangeduid als dringend door klant.");
  }
  parts.push("[Aangevraagd via klantenportaal]");
  return parts.join("\n");
}