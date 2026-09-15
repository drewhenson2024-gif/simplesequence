import type { DataPort, LeadSearchHit } from "./port";

export type NamedDataSource = {
  name: string;
  port: DataPort;
};

function dedupeKey(hit: LeadSearchHit): string | null {
  const li = hit.linkedinUrl?.trim().toLowerCase();
  if (li) return `li:${li}`;
  const email = hit.email?.trim().toLowerCase();
  if (email) return `em:${email}`;
  return null;
}

/** Apollo (if keyed) then stub catalog, then any extra adapters. Dedupes LinkedIn URL then email. */
export class WaterfallData implements DataPort {
  constructor(private readonly sources: NamedDataSource[]) {}

  sourceNames(): string[] {
    return this.sources.map((s) => s.name);
  }

  async searchPeople(input: { brief: string; limit: number; people?: LeadSearchHit[] }): Promise<LeadSearchHit[]> {
    if (input.people?.length) {
      return input.people.slice(0, Math.max(1, input.limit)).map((hit) => ({
        ...hit,
        source: hit.source ?? "provided",
      }));
    }
    const seen = new Set<string>();
    const out: LeadSearchHit[] = [];
    for (const src of this.sources) {
      if (out.length >= input.limit) break;
      const remaining = input.limit - out.length;
      const hits = await src.port.searchPeople({ brief: input.brief, limit: remaining });
      for (const hit of hits) {
        const key = dedupeKey(hit);
        if (key) {
          if (seen.has(key)) continue;
          seen.add(key);
        }
        out.push({ ...hit, source: hit.source ?? src.name });
        if (out.length >= input.limit) break;
      }
    }
    return out;
  }

  async researchLead(lead: LeadSearchHit) {
    const last = this.sources[this.sources.length - 1]?.port;
    if (!last) {
      return {
        openingLine: lead.openingLine,
        publicUrl: lead.publicUrl ?? lead.linkedinUrl ?? "",
        notes: "",
      };
    }
    return last.researchLead(lead);
  }
}
