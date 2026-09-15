import type { LeadSearchHit } from "./port";

function person(
  slug: string,
  first: string,
  last: string,
  company: string,
  title: string,
  extra?: Partial<LeadSearchHit>,
): LeadSearchHit {
  return {
    firstName: first,
    lastName: last,
    fullName: `${first} ${last}`,
    company,
    title,
    email: `${slug}@example.com`,
    linkedinUrl: `https://www.linkedin.com/in/${slug}`,
    publicUrl: extra?.publicUrl ?? `https://example.com/${slug}`,
    openingLine: extra?.openingLine ?? "",
    source: extra?.source ?? "stub_catalog",
    ...extra,
  };
}

function pad(
  seed: LeadSearchHit[],
  count: number,
  prefix: string,
  company: string,
  title: string,
): LeadSearchHit[] {
  const out = [...seed];
  for (let i = out.length; i < count; i += 1) {
    out.push(person(`${prefix}-${i + 1}`, `Lead`, `${prefix}${i + 1}`, company, title));
  }
  return out;
}

/** Cluster MCP-bench prompt-to-campaign briefs → identity stubs (not a people database). */
export const BENCH_SEARCH_CATALOG: Array<{ aliases: string[]; people: LeadSearchHit[] }> = [
  {
    aliases: ["northeastern", "restaurant-group alumni", "restaurant group alumni"],
    people: pad(
      [
        person("priya-rao", "Priya", "Rao", "Darden Restaurants", "Director of Operations", {
          publicUrl: "https://news.northeastern.edu/alumni/priya-rao",
        }),
        person("matt-cole", "Matt", "Cole", "Chipotle", "Regional Manager", {
          publicUrl: "https://example.com/matt-cole-alumni",
        }),
        person("lisa-nguyen", "Lisa", "Nguyen", "Sweetgreen", "VP People", {
          publicUrl: "https://example.com/lisa-nguyen-alumni",
        }),
      ],
      10,
      "nu-alum",
      "Restaurant Group",
      "Operations Lead",
    ),
  },
  {
    aliases: ["benefits broker", "experienced benefits brokers"],
    people: [
      person("owen-hale", "Owen", "Hale", "Marsh", "Benefits Broker", {
        publicUrl: "https://example.com/owen-hale",
      }),
      person("nina-park", "Nina", "Park", "Aon", "Senior Benefits Consultant", {
        publicUrl: "https://example.com/nina-park",
      }),
    ],
  },
  {
    aliases: ["boston ecommerce", "boston ecommerce operators"],
    people: [
      person("jordan-lee", "Jordan", "Lee", "Wayfair", "Ecommerce Operator", {
        publicUrl: "https://example.com/jordan-lee",
      }),
      person("sam-ortiz", "Sam", "Ortiz", "Chewy", "Director of DTC", {
        publicUrl: "https://example.com/sam-ortiz",
      }),
    ],
  },
  {
    aliases: ["ai-native gtm", "ai-native gtm teams"],
    people: [
      person("alex-cho", "Alex", "Cho", "Adept GTM", "Head of GTM", {
        publicUrl: "https://example.com/alex-cho",
      }),
      person("riley-brooks", "Riley", "Brooks", "Context Labs", "VP Sales", {
        publicUrl: "https://example.com/riley-brooks",
      }),
    ],
  },
  {
    aliases: ["indian developer", "indian developer decision-makers"],
    people: [
      person("arjun-mehta", "Arjun", "Mehta", "Razorpay", "Engineering Manager", {
        publicUrl: "https://example.com/arjun-mehta",
      }),
      person("neha-shah", "Neha", "Shah", "Freshworks", "Director of Engineering", {
        publicUrl: "https://example.com/neha-shah",
      }),
    ],
  },
  {
    aliases: ["retail/media", "retail/media directors"],
    people: [
      person("dana-west", "Dana", "West", "NBCUniversal", "VP Retail Media", {
        publicUrl: "https://example.com/dana-west",
      }),
      person("chris-vale", "Chris", "Vale", "Target", "Director of Media", {
        publicUrl: "https://example.com/chris-vale",
      }),
    ],
  },
  {
    aliases: ["enterprise cio", "enterprise cios"],
    people: [
      person("pat-ng", "Pat", "Ng", "Cisco", "CIO", { publicUrl: "https://example.com/pat-ng" }),
      person("morgan-ade", "Morgan", "Ade", "IBM", "Deputy CIO", {
        publicUrl: "https://example.com/morgan-ade",
      }),
    ],
  },
  {
    aliases: ["leasing broker", "jll & cbre", "jll and cbre"],
    people: [
      person("kim-ross", "Kim", "Ross", "JLL", "Leasing Broker", {
        publicUrl: "https://example.com/kim-ross",
      }),
      person("evan-liu", "Evan", "Liu", "CBRE", "Associate Broker", {
        publicUrl: "https://example.com/evan-liu",
      }),
    ],
  },
  {
    aliases: ["cpo / coo", "cpo / coo targeting"],
    people: pad(
      [
        person("taylor-quinn", "Taylor", "Quinn", "Stripe", "CPO", {
          publicUrl: "https://example.com/taylor-quinn",
        }),
        person("jamie-ford", "Jamie", "Ford", "Notion", "COO", {
          publicUrl: "https://example.com/jamie-ford",
        }),
      ],
      40,
      "exec",
      "Scale Co",
      "CPO",
    ),
  },
];

export const PROMPT_TO_CAMPAIGN_BRIEFS = [
  {
    title: "Restaurant-group alumni",
    brief:
      "Find 10 Northeastern University alumni currently working at US-headquartered restaurant companies. Create a personalized draft LinkedIn campaign.",
    limit: 10,
  },
  {
    title: "Experienced benefits brokers",
    brief: "Find experienced benefits brokers and save a personalized draft LinkedIn campaign.",
    limit: 10,
  },
  {
    title: "Boston ecommerce operators",
    brief: "Find Boston ecommerce operators and save a personalized draft LinkedIn campaign.",
    limit: 10,
  },
  {
    title: "AI-native GTM teams",
    brief: "Find AI-native GTM teams and save a personalized draft LinkedIn campaign.",
    limit: 10,
  },
  {
    title: "Indian developer decision-makers",
    brief: "Find Indian developer decision-makers and save a personalized draft LinkedIn campaign.",
    limit: 10,
  },
  {
    title: "Retail/media directors and VPs",
    brief: "Find retail/media directors and VPs and save a personalized draft LinkedIn campaign.",
    limit: 10,
  },
  {
    title: "Enterprise CIOs",
    brief: "Find enterprise CIOs and save a personalized draft LinkedIn campaign.",
    limit: 10,
  },
  {
    title: "JLL & CBRE leasing brokers",
    brief: "Find JLL & CBRE leasing brokers and save a personalized draft LinkedIn campaign.",
    limit: 10,
  },
  {
    title: "CPO / COO targeting — 40 leads",
    brief: "CPO / COO targeting — 40 leads. Save a personalized draft LinkedIn campaign.",
    limit: 40,
  },
] as const;

export function catalogHitsForBrief(brief: string, limit: number): LeadSearchHit[] {
  const hay = brief.toLowerCase();
  const entry = BENCH_SEARCH_CATALOG.find((row) => row.aliases.some((alias) => hay.includes(alias)));
  if (!entry) return [];
  return entry.people.slice(0, Math.max(1, limit));
}
