import { describe, expect, it } from "vitest";
import { applyProfileToDraft, parseHeadline } from "@/lib/domain/profile";
import type { LeadDraft } from "@/lib/ingest/parser";

function draft(partial: Partial<LeadDraft> = {}): LeadDraft {
  return {
    firstName: "",
    lastName: "",
    fullName: "",
    company: "",
    title: "",
    headline: "",
    location: "",
    about: "",
    email: null,
    linkedinUrl: "https://www.linkedin.com/in/priya-rao",
    linkedinUrlNormalized: "https://www.linkedin.com/in/priya-rao",
    openingLine: "",
    publicUrl: null,
    custom: {},
    raw: {},
    valid: true,
    skipReason: null,
    ...partial,
  };
}

describe("profile", () => {
  it("parses title and company from a headline", () => {
    expect(parseHeadline("Chairman and CEO at Microsoft")).toEqual({
      title: "Chairman and CEO",
      company: "Microsoft",
    });
    expect(parseHeadline("Operator · Example")).toEqual({ title: "Operator", company: "Example" });
  });

  it("fills empty merge fields and keeps CSV-provided ones", () => {
    const filled = applyProfileToDraft(draft({ fullName: "Priya Rao", firstName: "Priya", lastName: "Rao" }), {
      firstName: "Priya",
      lastName: "Rao",
      headline: "Operator at Example",
      title: "Operator",
      company: "Example",
      location: "Example City",
      about: "Builds sequences for operators.",
    });
    expect(filled.company).toBe("Example");
    expect(filled.headline).toBe("Operator at Example");
    expect(filled.location).toBe("Example City");
    expect(filled.about).toBe("Builds sequences for operators.");
    expect(filled.openingLine).toBe("");

    const kept = applyProfileToDraft(
      draft({
        fullName: "Ada Lovelace",
        firstName: "Ada",
        lastName: "Lovelace",
        company: "Analytical Engines",
        title: "Countess",
        headline: "Countess of Lovelace",
        location: "London",
        about: "Notes on the analytical engine",
        openingLine: "Saw your note on difference engines",
        linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
        linkedinUrlNormalized: "https://www.linkedin.com/in/ada-lovelace",
      }),
      {
        headline: "Operator at Example",
        title: "Operator",
        company: "Example",
        location: "Example City",
        about: "Mock about",
      },
    );
    expect(kept.company).toBe("Analytical Engines");
    expect(kept.title).toBe("Countess");
    expect(kept.headline).toBe("Countess of Lovelace");
    expect(kept.openingLine).toBe("Saw your note on difference engines");
  });
});
