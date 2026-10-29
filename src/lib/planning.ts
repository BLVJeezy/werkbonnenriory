/**
 * Een taak is pas volledig ingepland als dag, ploeg én activiteit ingevuld zijn.
 * Zolang één van de drie ontbreekt, blijft de taak bij "Nog in te plannen" staan.
 */
export const isFullyPlanned = (w: {
  scheduled_date: string | null;
  technician_id: string | null;
  activity_id: string | null;
}): boolean => !!w.scheduled_date && !!w.technician_id && !!w.activity_id;
