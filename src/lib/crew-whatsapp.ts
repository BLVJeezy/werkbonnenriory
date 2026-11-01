/** Click-to-chat only: never include passwords or grant access through the URL. */
export function crewWhatsAppLink(name: string, phone: string): string {
  const compact = phone.trim().replace(/[\s().-]/g, "");
  const digits = compact.startsWith("+") ? compact.slice(1) : compact.startsWith("00") ? compact.slice(2) : compact.startsWith("0") ? `32${compact.slice(1)}` : compact;
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw new Error("Vul een geldig telefoonnummer in, met landcode voor buitenlandse nummers.");
  const text = `Hallo ${name}, je bent uitgenodigd voor Riory Werkbonnen.\n\nInloggen: https://werkbonnenriory.lovable.app/auth\nPloegnaam: ${name}\n\nJe wachtwoord ontvang je afzonderlijk van de beheerder.\n\nGroeten, Riory`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}