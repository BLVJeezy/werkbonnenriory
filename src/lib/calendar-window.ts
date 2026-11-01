export function calendarWindow(now: Date, offset = 0): Date[] {
  return Array.from({ length: 9 }, (_, index) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1 + offset + index),
  );
}