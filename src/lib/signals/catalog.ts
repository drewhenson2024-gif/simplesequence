import { BENCH_SEARCH_CATALOG } from "../data/catalog";

export const SIGNAL_TYPES = ["hiring", "funding", "social_engagement", "tool_switch", "other"] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export type SignalDraft = {
  type: SignalType;
  title: string;
  detail: string;
  company: string;
  personName: string;
  source: string;
  occurredAt: string;
};

const TEMPLATES: Array<(name: string, company: string, title: string, now: Date) => SignalDraft> = [
  (name, company, title, now) => ({
    type: "hiring",
    title: `${company} is hiring around ${title}`,
    detail: `${name}’s team looks open — in-market this week (stub catalog, not a scrape).`,
    company,
    personName: name,
    source: "stub_catalog",
    occurredAt: now.toISOString(),
  }),
  (name, company, _title, now) => ({
    type: "funding",
    title: `${company} funding / growth signal`,
    detail: `Stub funding watch on ${name} at ${company}. Not a live funding feed.`,
    company,
    personName: name,
    source: "stub_catalog",
    occurredAt: now.toISOString(),
  }),
  (name, company, _title, now) => ({
    type: "social_engagement",
    title: `${name} engaged on a public post`,
    detail: `Social engagement stub for ${company}. No Sales Navigator scrape.`,
    company,
    personName: name,
    source: "stub_catalog",
    occurredAt: now.toISOString(),
  }),
  (name, company, _title, now) => ({
    type: "tool_switch",
    title: `${company} may be switching tools`,
    detail: `Tool-switch stub for ${name}. Adapter-ready; no live vendor.`,
    company,
    personName: name,
    source: "stub_catalog",
    occurredAt: now.toISOString(),
  }),
];

export function demoSignalsFromCatalog(now: Date, limit = 12): SignalDraft[] {
  const people = BENCH_SEARCH_CATALOG.flatMap((row) => row.people).slice(0, Math.max(4, limit));
  return people.map((person, i) => {
    const build = TEMPLATES[i % TEMPLATES.length];
    return build(person.fullName, person.company, person.title, now);
  });
}
