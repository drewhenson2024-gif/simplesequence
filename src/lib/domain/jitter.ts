import type { JobId } from "../ids";

/** Deterministic 2–15 minute jitter from job id. Replayable in tests. */
export function jitterMinutes(jobId: string | JobId): number {
  let hash = 2166136261;
  for (let i = 0; i < jobId.length; i += 1) {
    hash ^= jobId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  return 2 + (unsigned % 14);
}

export function addJitter(due: Date, jobId: string | JobId): Date {
  const next = new Date(due);
  next.setMinutes(next.getMinutes() + jitterMinutes(jobId));
  return next;
}

export type WorkingHours = {
  timezone: string;
  startHour: number;
  endHour: number;
  weekends: boolean;
};

export function zonedParts(date: Date, timezone: string): { weekday: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const weekdayName = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: map[weekdayName] ?? 1,
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((p) => p.type === "minute")?.value ?? "0"),
  };
}

export function inWorkingHours(date: Date, hours: WorkingHours): boolean {
  const { weekday, hour } = zonedParts(date, hours.timezone);
  if (!hours.weekends && (weekday === 0 || weekday === 6)) return false;
  return hour >= hours.startHour && hour < hours.endHour;
}

export function nextWorkingSlot(date: Date, hours: WorkingHours): Date {
  let cursor = new Date(date);
  for (let i = 0; i < 24 * 14; i += 1) {
    if (inWorkingHours(cursor, hours)) return cursor;
    cursor = new Date(cursor.getTime() + 15 * 60 * 1000);
  }
  return cursor;
}
