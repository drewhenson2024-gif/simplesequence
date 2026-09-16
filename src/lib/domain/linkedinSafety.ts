/** Conservative Unipile/LinkedIn invite pace for a standard account. Not a guarantee against restriction. */
export const LINKEDIN_INVITE_DAILY_CAP = 25;

export function calendarDay(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
