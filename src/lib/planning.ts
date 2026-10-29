/**
 * Een taak is pas volledig ingepland als dag, ploeg én activiteit ingevuld zijn.
 * Contracttaken hebben geen activiteit nodig: ze factureren het contractbedrag.
 * Zolang iets ontbreekt, blijft de taak bij "Nog in te plannen" staan.
 */
export const isFullyPlanned = (w: {
  scheduled_date: string | null;
  technician_id: string | null;
  activity_id: string | null;
  contract_id?: string | null;
}): boolean => !!w.scheduled_date && !!w.technician_id && (!!w.contract_id || !!w.activity_id);
