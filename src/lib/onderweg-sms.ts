/** De SMS-knop hoort op de taak zolang die nog open is, zodat de ploeg kan melden dat ze onderweg is vóór ze de taak opent.
 *  Een afgetekende werkbon is af en krijgt geen "onderweg"-bericht meer. */
export function showOnderwegSms(status: string | null | undefined): boolean {
  return status !== "afgetekend";
}
