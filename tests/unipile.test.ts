import { describe, expect, it } from "vitest";
import { channelFromUnipileAccount } from "@/lib/unipile/port";

describe("Unipile account channel", () => {
  it("maps LinkedIn and mailbox types", () => {
    expect(channelFromUnipileAccount({ id: "1", type: "LINKEDIN" })).toBe("linkedin");
    expect(channelFromUnipileAccount({ id: "2", provider: "GOOGLE" })).toBe("email");
    expect(channelFromUnipileAccount({ id: "3", type: "WHATSAPP" })).toBeNull();
  });
});
