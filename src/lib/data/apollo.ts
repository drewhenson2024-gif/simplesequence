import type { DataPort, LeadSearchHit } from "./port";
import { StubData } from "./stub";
import { WaterfallData } from "./waterfall";
import type { UnipilePort } from "../unipile/port";

type ApolloPerson = {
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  organization?: { name?: string };
  email?: string;
  linkedin_url?: string;
  photo_url?: string;
};

export class ApolloData implements DataPort {
  constructor(private readonly apiKey: string) {}

  async searchPeople(input: { brief: string; limit: number; people?: LeadSearchHit[] }): Promise<LeadSearchHit[]> {
    if (input.people?.length) {
      return input.people.slice(0, Math.max(1, input.limit)).map((hit) => ({
        ...hit,
        source: hit.source ?? "provided",
      }));
    }
    const res = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({ q_keywords: input.brief, per_page: Math.min(100, Math.max(1, input.limit)) }),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { people?: ApolloPerson[] };
    return (body.people ?? [])
      .map((p): LeadSearchHit => {
        const first = p.first_name ?? "";
        const last = p.last_name ?? "";
        return {
          firstName: first,
          lastName: last,
          fullName: p.name || `${first} ${last}`.trim(),
          company: p.organization?.name ?? "",
          title: p.title ?? "",
          email: p.email ?? null,
          linkedinUrl: p.linkedin_url ?? null,
          publicUrl: p.photo_url ?? p.linkedin_url ?? null,
          openingLine: "",
          source: "apollo",
        };
      })
      .slice(0, input.limit);
  }

  async researchLead(lead: LeadSearchHit) {
    return new StubData().researchLead(lead);
  }
}

export function createDataPort(
  env: { [key: string]: string | undefined } = process.env,
  unipile?: UnipilePort,
): DataPort {
  const stub = new StubData(unipile);
  const sources: Array<{ name: string; port: DataPort }> = [];
  const key = env.APOLLO_API_KEY?.trim();
  if (key) sources.push({ name: "apollo", port: new ApolloData(key) });
  sources.push({ name: "stub_catalog", port: stub });
  return new WaterfallData(sources);
}
