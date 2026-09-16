import { describe, expect, it } from "vitest";
import { renderTemplate, templateVariables, VARIABLE_GROUPS } from "@/lib/domain/templates";

describe("template variables", () => {
  it("groups Identity / Role / About A–Z inside each group", () => {
    expect(VARIABLE_GROUPS.map((g) => g.heading)).toEqual(["Identity", "Role", "About"]);
    expect([...VARIABLE_GROUPS[0]!.fields]).toEqual(["first_name", "full_name", "last_name"]);
    expect([...VARIABLE_GROUPS[1]!.fields]).toEqual(["company", "headline", "location", "title"]);
    expect([...VARIABLE_GROUPS[2]!.fields]).toEqual(["about", "profile_url"]);
    expect(templateVariables()).not.toContain("opening_line");
  });

  it("renders profile fields and leaves unknown tokens empty", () => {
    const body = renderTemplate("Hi {{first_name}} — {{title}} at {{company}} · {{headline}}", {
      firstName: "Satya",
      lastName: "Nadella",
      fullName: "Satya Nadella",
      company: "Microsoft",
      title: "CEO",
      headline: "Chairman and CEO at Microsoft",
      location: "Redmond",
      about: "Empowering every person",
      openingLine: "",
      email: null,
      linkedinUrl: "https://www.linkedin.com/in/satyanadella",
      profileUrl: "https://www.linkedin.com/in/satyanadella",
    });
    expect(body).toBe("Hi Satya — CEO at Microsoft · Chairman and CEO at Microsoft");
  });
});
