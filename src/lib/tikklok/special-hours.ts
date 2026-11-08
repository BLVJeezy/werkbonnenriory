const BRUSSELS_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
});

function isSpecialInstant(date: Date) {
  const parts = BRUSSELS_PARTS.formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  return weekday === "Sat" || weekday === "Sun" || hour >= 18;
}

export function splitWorkedMinutes(clockIn: string, clockOut: string | null) {
  if (!clockOut) return { totalMinutes: null, dayMinutes: null, specialMinutes: null };
  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { totalMinutes: 0, dayMinutes: 0, specialMinutes: 0 };
  }

  const totalMinutes = Math.round((end - start) / 60_000);
  let specialMilliseconds = 0;
  for (let cursor = start; cursor < end; cursor += 60_000) {
    const segmentEnd = Math.min(cursor + 60_000, end);
    const midpoint = new Date(cursor + (segmentEnd - cursor) / 2);
    if (isSpecialInstant(midpoint)) specialMilliseconds += segmentEnd - cursor;
  }
  const specialMinutes = Math.min(totalMinutes, Math.round(specialMilliseconds / 60_000));
  return { totalMinutes, dayMinutes: totalMinutes - specialMinutes, specialMinutes };
}