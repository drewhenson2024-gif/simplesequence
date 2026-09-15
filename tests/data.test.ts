import { describe, expect, it } from "vitest";
import { ApolloData, createDataPort } from "@/lib/data/apollo";
import { catalogHitsForBrief } from "@/lib/data/catalog";
import { StubData } from "@/lib/data/stub";
import { WaterfallData } from "@/lib/data/waterfall";
import { MockUnipile } from "@/lib/unipile/port";

describe("DataPort", () => {
  it("stub search is empty unless the brief hits the catalog or identities are passed", async () => {
    const port = new StubData();
    expect(await port.searchPeople({ brief: "random dentists in omaha", limit: 10 })).toEqual([]);
    const passed = await port.searchPeople({
      brief: "anything",
      limit: 1,
      people: [
        {
          firstName: "Ada",
          lastName: "Lovelace",
          fullName: "Ada Lovelace",
          company: "Analytical Engines",
          title: "Countess",
          email: "ada@example.com",
          linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
          publicUrl: "https://example.com/ada",
          openingLine: "",
        },
      ],
    });
    expect(passed).toHaveLength(1);
    expect(passed[0]?.firstName).toBe("Ada");
  });

  it("catalog matches Cluster-style briefs without pretending to be 50 vendors", () => {
    expect(catalogHitsForBrief("Northeastern alumni at restaurant groups", 10)).toHaveLength(10);
    expect(catalogHitsForBrief("CPO / COO targeting — 40 leads", 40)).toHaveLength(40);
    expect(catalogHitsForBrief("unknown industry", 10)).toHaveLength(0);
  });

  it("researchLead fills opener and public URL, using Unipile lookup when connected", async () => {
    const unipile = new MockUnipile();
    const port = new StubData(unipile);
    const researched = await port.researchLead({
      firstName: "Priya",
      lastName: "Rao",
      fullName: "Priya Rao",
      company: "Darden Restaurants",
      title: "Director of Operations",
      email: "priya@example.com",
      linkedinUrl: "https://www.linkedin.com/in/priya-rao",
      publicUrl: null,
      openingLine: "",
    });
    expect(researched.openingLine).toContain("Director of Operations");
    expect(researched.publicUrl).toContain("linkedin.com");
    expect(unipile.calls.some((c) => c.kind === "lookup")).toBe(true);
  });

  it("createDataPort is a waterfall of stub catalog without APOLLO_API_KEY", () => {
    const port = createDataPort({ APOLLO_API_KEY: "" }, new MockUnipile());
    expect(port).toBeInstanceOf(WaterfallData);
    expect((port as WaterfallData).sourceNames()).toEqual(["stub_catalog"]);
  });

  it("createDataPort puts Apollo first when a key is present", () => {
    const port = createDataPort({ APOLLO_API_KEY: "test-key" }, new MockUnipile());
    expect(port).toBeInstanceOf(WaterfallData);
    expect((port as WaterfallData).sourceNames()).toEqual(["apollo", "stub_catalog"]);
  });

  it("Apollo-shaped backend uses passed identities and does not require a network call", async () => {
    const port = new ApolloData("test-key");
    const hits = await port.searchPeople({
      brief: "ignored",
      limit: 2,
      people: catalogHitsForBrief("benefits broker", 2),
    });
    expect(hits[0]?.title).toMatch(/Benefits/i);
  });
});
