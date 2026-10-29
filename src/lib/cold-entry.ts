// De browser kan bij het openen van de app de laatst geopende pagina terugzetten,
// bijvoorbeeld een afgewerkte werkbon. Eén enkel koud instappen na een echt herladen
// van de pagina geldt daarom als "herstel". Klikken binnen de app zijn dat niet:
// die veranderen de URL zonder de pagina te herladen, en de herkenning is dan al gebruikt.

let entryPath = "";
let restoredHandled = false;

function normalize(path: string) {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** Wordt één keer bij het opstarten gevoed met de URL waarmee de pagina echt geladen is. */
export function noteAppEntry(path: string) {
  if (!entryPath) entryPath = normalize(path);
}

/** True voor het eerste koud openen van precies die pagina; nooit voor in-app klikken. */
export function isRestoredWorkOrder(path: string) {
  return !restoredHandled && entryPath !== "" && entryPath === normalize(path);
}

/** Het herstel is verwerkt: een volgende, bewuste rit naar dezelfde pagina telt niet meer mee. */
export function clearAppEntry() {
  restoredHandled = true;
}
