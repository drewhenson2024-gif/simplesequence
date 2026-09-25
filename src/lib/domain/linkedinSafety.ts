/** Conservative Unipile/LinkedIn invite pace for a standard account. Not a guarantee against restriction. */
export const LINKEDIN_INVITE_DAILY_CAP = 25;
export const LINKEDIN_INVITE_ROLLING_MS = 24 * 60 * 60 * 1000;
/** Floor between actions on one account so a tick cannot burst. */
export const LINKEDIN_MIN_GAP_MS = 2 * 60 * 1000;

export const PROVIDER_THROTTLE = "provider_throttle";
export const PROVIDER_RESTRICTION = "provider_restriction";

export const PROVIDER_DISCONNECTED = "provider_disconnected";

export type LinkedInProviderSignal = "quota" | "throttle" | "restrict" | "disconnected";

/** Classify Unipile/LinkedIn send errors. Hard restrict language wins over a 429. */
export function classifyLinkedInProviderError(message: string): LinkedInProviderSignal | null {
  const text = message.toLowerCase();
  if (/disconnected_account|disconnected from the provider/.test(text)) return "disconnected";
  if (/captcha|checkpoint|temporarily blocked/.test(text)) return "restrict";
  if (/restrict/.test(text) && !/cannot_resend_yet/.test(text)) return "restrict";
  if (/cannot_resend_yet/.test(text)) return "quota";
  if (/\b422\b/.test(text) && /invite|invitation|resend|relation/.test(text)) return "quota";
  if (/429|too_many_requests|rate.?limit|too many|limit exceeded/.test(text)) return "throttle";
  return null;
}

export function calendarDay(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
