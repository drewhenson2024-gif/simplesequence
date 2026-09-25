import { canMessageBeforeAccept, connectionNote } from "./linkedinPlan";

export type FrequencyCategoryId =
  | "connection_with_note"
  | "connection_without_note"
  | "message_after_accept"
  | "message_before_accept";

export type FrequencyPeriod = "day" | "week" | "month";

export type FrequencyAmounts = Record<FrequencyPeriod, number>;

export const FREQUENCY_DAY_MS = 24 * 60 * 60 * 1000;
export const FREQUENCY_WEEK_MS = 7 * FREQUENCY_DAY_MS;
export const FREQUENCY_MONTH_MS = 30 * FREQUENCY_DAY_MS;

const FREE_NOTE: FrequencyAmounts = { day: 5, week: 5, month: 5 };
const FREE_PLAIN: FrequencyAmounts = { day: 21, week: 150, month: 600 };
const PAID_INVITE: FrequencyAmounts = { day: 80, week: 200, month: 800 };
const MESSAGE: FrequencyAmounts = { day: 100, week: 700, month: 3000 };
const INMAIL: FrequencyAmounts = { day: 30, week: 210, month: 800 };
const NONE: FrequencyAmounts = { day: 0, week: 0, month: 0 };

const LABELS: Record<FrequencyCategoryId, string> = {
  connection_with_note: "Connection with a note",
  connection_without_note: "Connection without a note",
  message_after_accept: "Message after they accept",
  message_before_accept: "Message before they accept",
};

export function frequencyCategories(plan: string | null | undefined): Array<{
  id: FrequencyCategoryId;
  label: string;
} & FrequencyAmounts> {
  const paid = canMessageBeforeAccept(plan);
  const rows: Array<{ id: FrequencyCategoryId } & FrequencyAmounts> = paid
    ? [
        { id: "connection_with_note", ...PAID_INVITE },
        { id: "connection_without_note", ...PAID_INVITE },
        { id: "message_after_accept", ...MESSAGE },
        { id: "message_before_accept", ...INMAIL },
      ]
    : [
        { id: "connection_with_note", ...FREE_NOTE },
        { id: "connection_without_note", ...FREE_PLAIN },
        { id: "message_after_accept", ...MESSAGE },
        { id: "message_before_accept", ...NONE },
      ];
  return rows.map((row) => ({ ...row, label: LABELS[row.id] }));
}

export function categoryForStep(input: {
  action: string;
  bodyTemplate: string;
  followsConnection: boolean;
}): FrequencyCategoryId {
  if (input.action === "connection") {
    return connectionNote(input.bodyTemplate) ? "connection_with_note" : "connection_without_note";
  }
  return input.followsConnection ? "message_after_accept" : "message_before_accept";
}

export function sequenceAllowance(
  plan: string | null | undefined,
  steps: Array<{ action: string; bodyTemplate: string; enabled?: boolean | number }>,
): { day: number; week: number; month: number; limitedBy: string; sends: boolean } {
  const on = steps.filter((step) => step.enabled !== false && step.enabled !== 0);
  if (on.length === 0) return { day: 0, week: 0, month: 0, limitedBy: "No actions", sends: false };
  const catalog = frequencyCategories(plan);
  let best = catalog[0];
  on.forEach((step, index) => {
    const followsConnection = on.slice(0, index).some((row) => row.action === "connection");
    const id = categoryForStep({
      action: step.action,
      bodyTemplate: step.bodyTemplate,
      followsConnection,
    });
    const row = catalog.find((item) => item.id === id) ?? catalog[0];
    const tighter =
      index === 0 ||
      row.month < best.month ||
      (row.month === best.month && row.week < best.week) ||
      (row.month === best.month && row.week === best.week && row.day < best.day);
    if (tighter) best = row;
  });
  return {
    day: best.day,
    week: best.week,
    month: best.month,
    limitedBy: best.label,
    sends: best.day > 0 || best.week > 0 || best.month > 0,
  };
}

export function bindingWindow(
  allowance: FrequencyAmounts,
  used: FrequencyAmounts,
): { period: FrequencyPeriod; used: number; allowance: number; periodLabel: string } {
  const order: FrequencyPeriod[] = ["month", "week", "day"];
  for (const period of order) {
    if (used[period] >= allowance[period]) {
      return { period, used: used[period], allowance: allowance[period], periodLabel: periodPhrase(period) };
    }
  }
  let pick: FrequencyPeriod = "month";
  let least = Number.POSITIVE_INFINITY;
  for (const period of order) {
    const room = allowance[period] === 0 ? 0 : (allowance[period] - used[period]) / allowance[period];
    if (room < least) {
      least = room;
      pick = period;
    }
  }
  return { period: pick, used: used[pick], allowance: allowance[pick], periodLabel: periodPhrase(pick) };
}

function periodPhrase(period: FrequencyPeriod): string {
  if (period === "day") return "today";
  if (period === "week") return "this week";
  return "this month";
}
