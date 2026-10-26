/** Extra grote letters: de beheerder zet het per ploeg aan, een ploeg kan het op haar eigen tablet overrulen. */
export const LARGE_TEXT_KEY = "riory-large-text";

export type DeviceChoice = "on" | "off" | null;

/** Keuze van de ploeg op dit toestel; null = niets gekozen, dus wat de beheerder instelde. */
export function largeTextOn(adminSet: boolean, device: DeviceChoice): boolean {
  if (device === "on") return true;
  if (device === "off") return false;
  return adminSet;
}

export function readDeviceChoice(): DeviceChoice {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(LARGE_TEXT_KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}

export function writeDeviceChoice(choice: DeviceChoice) {
  if (typeof window === "undefined") return;
  try {
    if (choice === null) window.localStorage.removeItem(LARGE_TEXT_KEY);
    else window.localStorage.setItem(LARGE_TEXT_KEY, choice);
  } catch {
    /* toestel bewaart niets: de instelling van de beheerder blijft dan gelden */
  }
}
