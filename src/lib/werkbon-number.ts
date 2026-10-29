/**
 * Een werkbonnummer wordt pas toegekend bij de eerste tijdstart (of bij afronden).
 * Taken die nog niet gestart zijn hebben geen nummer en tonen "Nieuw".
 */
export const werkbonNr = (n: number | null | undefined): string => (n ? `#${n}` : "Nieuw");
