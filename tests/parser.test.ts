import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { detectFormat, normalizeLinkedInUrl, parseLeads } from "@/lib/ingest/parser";

const fixture = (name: string) => readFileSync(path.join(process.cwd(), "fixtures", name), "utf8");

function markdown87(): string {
  const lines = ["| name | linkedin |", "| --- | --- |"];
  for (let i = 1; i <= 87; i += 1) {
    lines.push(`| Person ${i} | https://www.linkedin.com/in/person-${i} |`);
  }
  return lines.join("\n");
}

describe("lead parser", () => {
  it("csv 6 rows preserves fields", () => {
    const parsed = parseLeads(fixture("csv-6.csv"), "csv");
    expect(parsed.imported).toBe(6);
    expect(parsed.invalid).toBe(0);
    const ada = parsed.rows[0];
    expect(ada.firstName).toBe("Ada");
    expect(ada.company).toBe("Analytical Engines");
    expect(ada.title).toBe("Countess");
    expect(ada.email).toBe("ada@example.com");
    expect(ada.openingLine).toContain("difference engines");
    expect(ada.publicUrl).toBe("https://example.com/ada");
    expect(ada.linkedinUrlNormalized).toBe("https://www.linkedin.com/in/ada-lovelace");
  });

  it("invalid rows do not crash the import", () => {
    const parsed = parseLeads("name,company\nNo Contact,Acme\n", "csv");
    expect(parsed.imported).toBe(0);
    expect(parsed.invalid).toBe(1);
    expect(parsed.rows[0]?.skipReason).toMatch(/missing/);
  });

  it("markdown connection-request list of 87 parses LinkedIn URLs", () => {
    const parsed = parseLeads(markdown87(), "markdown");
    expect(parsed.imported).toBe(87);
    expect(parsed.rows.every((r) => r.linkedinUrlNormalized?.startsWith("https://www.linkedin.com/in/person-"))).toBe(
      true,
    );
  });

  it("detects markdown tables", () => {
    expect(detectFormat(markdown87())).toBe("markdown");
  });

  it("normalizes LinkedIn URLs (property)", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9-]{1,40}$/), (slug) => {
        const n = normalizeLinkedInUrl(`https://www.linkedin.com/in/${slug.toUpperCase()}/?trk=x`);
        expect(n).toBe(`https://www.linkedin.com/in/${slug.toLowerCase()}`);
      }),
    );
  });

  it("parses one LinkedIn URL per line without a CSV header", () => {
    const parsed = parseLeads(
      "https://www.linkedin.com/in/priya-rao\nhttps://linkedin.com/in/matt-cole/?trk=x\n",
    );
    expect(detectFormat("https://www.linkedin.com/in/priya-rao\nhttps://www.linkedin.com/in/matt-cole")).toBe(
      "urls",
    );
    expect(parsed.imported).toBe(2);
    expect(parsed.rows.map((r) => r.linkedinUrlNormalized)).toEqual([
      "https://www.linkedin.com/in/priya-rao",
      "https://www.linkedin.com/in/matt-cole",
    ]);
    expect(parsed.rows[0]?.fullName).toBe("Priya Rao");
  });

  it("parses markdown bullets with profile URLs", () => {
    const parsed = parseLeads(
      "- Jane Doe https://linkedin.com/in/jane-doe\n- https://www.linkedin.com/in/john-roe John Roe",
      "markdown",
    );
    expect(parsed.imported).toBe(2);
    expect(parsed.rows.map((r) => r.linkedinUrlNormalized)).toEqual([
      "https://www.linkedin.com/in/jane-doe",
      "https://www.linkedin.com/in/john-roe",
    ]);
  });
});
