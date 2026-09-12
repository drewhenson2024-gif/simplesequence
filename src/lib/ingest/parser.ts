export type LeadDraft = {
  firstName: string;
  lastName: string;
  fullName: string;
  company: string;
  title: string;
  email: string | null;
  linkedinUrl: string | null;
  linkedinUrlNormalized: string | null;
  openingLine: string;
  publicUrl: string | null;
  custom: Record<string, string>;
  raw: Record<string, string>;
  valid: boolean;
  skipReason: string | null;
};

export type ParseResult = {
  rows: LeadDraft[];
  imported: number;
  invalid: number;
};

const HEADER_ALIASES: Record<string, string[]> = {
  first_name: ["first_name", "first", "firstname", "given_name", "given"],
  last_name: ["last_name", "last", "lastname", "surname", "family_name"],
  full_name: ["full_name", "name", "full name", "fullname"],
  company: ["company", "company_name", "org", "organization", "account"],
  title: ["title", "job_title", "role", "position"],
  email: ["email", "email_address", "emailaddress", "mail"],
  linkedin_url: [
    "linkedin_url",
    "linkedin",
    "linkedin url",
    "profile",
    "li_url",
    "linkedinurl",
    "profile_url",
  ],
  opening_line: ["opening_line", "opener", "personalization", "opener_line", "icebreaker"],
  public_url: ["public_url", "url", "website", "source_url"],
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function canonicalField(header: string): string | null {
  const n = normHeader(header);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(n)) return field;
  }
  if (n.startsWith("custom_")) return n;
  return null;
}

export function normalizeLinkedInUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let raw = trimmed;
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw.replace(/^\/+/, "")}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/i.test(parsed.hostname)) return null;
  const parts = parsed.pathname.split("/").filter(Boolean);
  const inIdx = parts.findIndex((p) => p.toLowerCase() === "in");
  if (inIdx === -1 || !parts[inIdx + 1]) return null;
  const slug = decodeURIComponent(parts[inIdx + 1])
    .replace(/\/+$/, "")
    .toLowerCase();
  if (!slug) return null;
  return `https://www.linkedin.com/in/${slug}`;
}

export function normalizeEmail(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (!v || !v.includes("@") || v.startsWith("@") || v.endsWith("@")) return null;
  return v;
}

function splitName(full: string): { first: string; last: string } {
  const bits = full.trim().split(/\s+/).filter(Boolean);
  if (bits.length === 0) return { first: "", last: "" };
  if (bits.length === 1) return { first: bits[0], last: "" };
  return { first: bits[0], last: bits.slice(1).join(" ") };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function draftFromMap(raw: Record<string, string>): LeadDraft {
  const mapped: Record<string, string> = {};
  const custom: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const field = canonicalField(k);
    if (field && HEADER_ALIASES[field]) {
      mapped[field] = v;
    } else if (field?.startsWith("custom_")) {
      custom[field] = v;
    } else if (k.trim()) {
      custom[normHeader(k)] = v;
    }
  }
  const fullName =
    mapped.full_name?.trim() ||
    [mapped.first_name, mapped.last_name].filter(Boolean).join(" ").trim();
  const split = splitName(fullName);
  const firstName = mapped.first_name?.trim() || split.first;
  const lastName = mapped.last_name?.trim() || split.last;
  const email = mapped.email ? normalizeEmail(mapped.email) : null;
  const linkedinUrlNormalized = mapped.linkedin_url
    ? normalizeLinkedInUrl(mapped.linkedin_url)
    : scrapeLinkedInFromValues(raw);
  const linkedinUrl = linkedinUrlNormalized || mapped.linkedin_url?.trim() || null;
  const valid = Boolean(email || linkedinUrlNormalized);
  return {
    firstName,
    lastName,
    fullName: fullName || `${firstName} ${lastName}`.trim(),
    company: mapped.company?.trim() ?? "",
    title: mapped.title?.trim() ?? "",
    email,
    linkedinUrl,
    linkedinUrlNormalized,
    openingLine: mapped.opening_line?.trim() ?? "",
    publicUrl: mapped.public_url?.trim() || null,
    custom,
    raw,
    valid,
    skipReason: valid ? null : "missing linkedin_url or email",
  };
}

function scrapeLinkedInFromValues(raw: Record<string, string>): string | null {
  for (const v of Object.values(raw)) {
    const n = normalizeLinkedInUrl(v);
    if (n) return n;
  }
  return null;
}

function parseCsvLeads(text: string): LeadDraft[] {
  const table = parseCsv(text);
  if (table.length === 0) return [];
  const headers = table[0].map((h) => h.trim());
  const looksLikeHeader = headers.some((h) => canonicalField(h) || /name|email|linkedin/i.test(h));
  const start = looksLikeHeader ? 1 : 0;
  const cols = looksLikeHeader ? headers : headers.map((_, i) => `col_${i}`);
  const rows: LeadDraft[] = [];
  for (let r = start; r < table.length; r += 1) {
    const raw: Record<string, string> = {};
    table[r].forEach((cell, i) => {
      raw[cols[i] ?? `col_${i}`] = cell.trim();
    });
    rows.push(draftFromMap(raw));
  }
  return rows;
}

function splitMdRow(line: string): string[] {
  const parts = line.split("|").map((c) => c.trim());
  if (parts[0] === "") parts.shift();
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function parseMarkdownTable(text: string): LeadDraft[] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return null;
  const cells = splitMdRow(lines[0]);
  if (cells.length < 2) return null;
  const sep = lines[1];
  if (!/^\s*\|?\s*:?-{3,}/.test(sep)) return null;
  const rows: LeadDraft[] = [];
  for (let i = 2; i < lines.length; i += 1) {
    const cols = splitMdRow(lines[i]);
    const raw: Record<string, string> = {};
    cells.forEach((h, idx) => {
      raw[h] = cols[idx] ?? "";
    });
    rows.push(draftFromMap(raw));
  }
  return rows;
}

function parseMarkdownBullets(text: string): LeadDraft[] {
  const rows: LeadDraft[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("-") && !t.startsWith("*")) continue;
    const body = t.replace(/^[-*]\s+/, "");
    const urlMatch = body.match(/https?:\/\/[^\s)]+/i) || body.match(/linkedin\.com\/in\/[^\s)]+/i);
    const url = urlMatch ? urlMatch[0] : "";
    const name = body.replace(url, "").replace(/[()[\]]/g, " ").replace(/\s+/g, " ").trim();
    const emailMatch = body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    rows.push(
      draftFromMap({
        name,
        linkedin_url: url,
        email: emailMatch?.[0] ?? "",
      }),
    );
  }
  return rows;
}

export function detectFormat(text: string): "csv" | "markdown" {
  const trimmed = text.trim();
  if (trimmed.includes("|") && /\n\s*\|?\s*-{3,}/.test(trimmed)) return "markdown";
  if (/^[-*]\s+/m.test(trimmed) && /linkedin\.com/i.test(trimmed) && !trimmed.includes(",")) {
    return "markdown";
  }
  return "csv";
}

export function parseLeads(text: string, format: "csv" | "markdown" | "auto" = "auto"): ParseResult {
  const kind = format === "auto" ? detectFormat(text) : format;
  let rows: LeadDraft[] = [];
  if (kind === "markdown") {
    rows = parseMarkdownTable(text) ?? parseMarkdownBullets(text);
  } else {
    rows = parseCsvLeads(text);
  }
  return {
    rows,
    imported: rows.filter((r) => r.valid).length,
    invalid: rows.filter((r) => !r.valid).length,
  };
}

export function contentHash(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `imp_${(hash >>> 0).toString(16)}`;
}
