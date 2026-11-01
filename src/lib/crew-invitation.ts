export const CREW_INVITATION_HOURS = 72;
export const crewPasswordSchemaMessage = "Kies een wachtwoord van minstens 8 tekens (maximaal 72).";
export function crewInvitationUrl(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Ongeldige uitnodigingscode");
  return `https://werkbonnenriory.lovable.app/ploeg-uitnodiging#${token}`;
}
export function invitationUsable(row: { expires_at: string; consumed_at: string | null }, now = Date.now()) {
  return row.consumed_at === null && Date.parse(row.expires_at) > now;
}