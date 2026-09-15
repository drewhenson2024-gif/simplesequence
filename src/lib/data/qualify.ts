export type QualifyDecision = "fit" | "maybe" | "no";

export type QualifyResult = {
  decision: QualifyDecision;
  explanation: string;
  score: number;
  reason: string;
};

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "are",
  "was",
  "who",
  "has",
  "have",
  "not",
  "but",
  "their",
  "they",
  "currently",
  "current",
  "working",
]);

const SYN: Record<string, string[]> = {
  technical: ["engineer", "developer", "software", "engineering", "technical", "swe"],
  security: ["security", "infosec", "soc", "ciso"],
  broker: ["broker", "brokerage"],
  cio: ["cio", "chief", "information"],
  cpo: ["cpo", "product"],
  coo: ["coo", "operating"],
  export: ["export", "airexport", "freight", "logistics"],
  "air-export": ["export", "airexport", "freight", "logistics"],
  airexport: ["export", "airexport", "freight", "logistics"],
  headquarters: ["headquarters", "hq", "headquartered"],
  production: ["production", "operator", "agents"],
  agents: ["agents", "operator", "production"],
  rnd: ["rnd", "research", "development"],
  exceptions: ["exception", "exceptions"],
};

const SHORT = new Set(["hq", "cio", "cpo", "coo", "rd", "soc"]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/air[\s-]*export/g, " airexport ")
    .replace(/r\s*&\s*d/g, " rnd ");
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9+]+/i)
    .filter((w) => (w.length > 2 || SHORT.has(w)) && !STOP.has(w));
}

function expand(word: string): string[] {
  return [word, ...(SYN[word] ?? [])];
}

export function qualifyLead(blob: string, criteria: string): QualifyResult {
  const needles = tokens(criteria);
  const hay = normalize(blob);
  const hits = needles.filter((n) => expand(n).some((alias) => hay.includes(alias)));
  const need = Math.max(1, Math.ceil(needles.length * 0.35));
  let decision: QualifyDecision = "no";
  if (hits.length >= need && hits.length >= 2) decision = "fit";
  else if (hits.length >= 1) decision = "maybe";
  if (needles.length === 0) {
    return {
      decision: "maybe",
      explanation: "No usable criteria tokens; left as maybe.",
      score: 40,
      reason: "No usable criteria tokens; left as maybe.",
    };
  }
  const explanation =
    hits.length === 0
      ? `No overlap with “${criteria.trim()}”.`
      : `Matched ${hits.join(", ")} from “${criteria.trim()}”.`;
  const ratio = hits.length / needles.length;
  let score = 0;
  if (decision === "fit") score = Math.min(100, Math.max(70, Math.round(70 + ratio * 30)));
  else if (decision === "maybe") score = Math.min(69, Math.max(30, Math.round(30 + ratio * 39)));
  else score = Math.min(29, Math.round(ratio * 29));
  return { decision, explanation, score, reason: explanation };
}
