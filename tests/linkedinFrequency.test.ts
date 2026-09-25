import { describe, expect, it } from "vitest";
import { frequencyCategories, sequenceAllowance } from "@/lib/domain/linkedinFrequency";

describe("suggested frequency", () => {
  it("sets a free account’s connection with a note to 5 across day, week, and month", () => {
    const noted = frequencyCategories("normal").find((row) => row.id === "connection_with_note");
    const plain = frequencyCategories("normal").find((row) => row.id === "connection_without_note");
    const before = frequencyCategories(null).find((row) => row.id === "message_before_accept");
    expect(noted).toMatchObject({ day: 5, week: 5, month: 5 });
    expect(plain).toMatchObject({ day: 21, week: 150, month: 600 });
    expect(before).toMatchObject({ day: 0, week: 0, month: 0 });
  });

  it("uses the paid invitation amounts once the account can message before an accept", () => {
    const noted = frequencyCategories("premium").find((row) => row.id === "connection_with_note");
    const before = frequencyCategories("sales_navigator").find((row) => row.id === "message_before_accept");
    expect(noted).toMatchObject({ day: 80, week: 200, month: 800 });
    expect(before).toMatchObject({ day: 30, week: 210, month: 800 });
  });

  it("limits a sequence by the tightest action", () => {
    const noted = sequenceAllowance("normal", [
      { action: "connection", bodyTemplate: "Hi {{first_name}}", enabled: true },
      { action: "message", bodyTemplate: "Following up", enabled: true },
    ]);
    expect(noted).toMatchObject({ day: 5, week: 5, month: 5, limitedBy: "Connection with a note", sends: true });
    const plain = sequenceAllowance("normal", [
      { action: "connection", bodyTemplate: "  ", enabled: true },
    ]);
    expect(plain).toMatchObject({ day: 21, week: 150, month: 600, limitedBy: "Connection without a note" });
    const blocked = sequenceAllowance("normal", [{ action: "message", bodyTemplate: "Hello", enabled: true }]);
    expect(blocked.sends).toBe(false);
  });
});
