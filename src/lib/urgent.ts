/** Kader en oplichting voor dringende open taken die vandaag geholpen moeten worden. */
export const URGENT_RING = "ring-4 ring-destructive ring-offset-2 ring-offset-background shadow-lg shadow-destructive/40";
export const isUrgentOpen = (w: { urgent?: boolean | null; status: string }) => !!w.urgent && w.status !== "afgetekend";
