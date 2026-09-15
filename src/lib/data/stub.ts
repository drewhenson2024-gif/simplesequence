import type { DataPort, LeadSearchHit } from "./port";
import { catalogHitsForBrief } from "./catalog";
import type { UnipilePort } from "../unipile/port";

export class StubData implements DataPort {
  constructor(private readonly unipile?: UnipilePort) {}

  async searchPeople(input: { brief: string; limit: number; people?: LeadSearchHit[] }): Promise<LeadSearchHit[]> {
    if (input.people?.length) {
      return input.people.slice(0, Math.max(1, input.limit)).map((hit) => ({
        ...hit,
        source: hit.source ?? "provided",
      }));
    }
    return catalogHitsForBrief(input.brief, input.limit).map((hit) => ({
      ...hit,
      source: hit.source ?? "stub_catalog",
    }));
  }

  async researchLead(lead: LeadSearchHit): Promise<{ openingLine: string; publicUrl: string; notes: string }> {
    let notes = "";
    if (this.unipile?.lookupProfile && lead.linkedinUrl) {
      try {
        const profile = await this.unipile.lookupProfile({ profileUrl: lead.linkedinUrl });
        if (profile.headline) notes = profile.headline;
      } catch {
        notes = "";
      }
    }
    const title = lead.title.trim();
    const company = lead.company.trim();
    const openingLine =
      lead.openingLine.trim() ||
      (title && company
        ? `Noticed your work as ${title} at ${company}`
        : title
          ? `Noticed your work as ${title}`
          : company
            ? `Noticed your work at ${company}`
            : `Looked up ${lead.fullName}`);
    const publicUrl =
      lead.publicUrl ||
      lead.linkedinUrl ||
      `https://example.com/${lead.fullName.toLowerCase().replace(/\s+/g, "-")}`;
    return { openingLine, publicUrl, notes };
  }
}
