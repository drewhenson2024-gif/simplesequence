import type { LeadDraft } from "../ingest/parser";

export type ProfileLookup = {
  firstName?: string;
  lastName?: string;
  name?: string;
  headline?: string;
  title?: string;
  company?: string;
  location?: string;
  about?: string;
  profileUrl?: string;
};

export function parseHeadline(headline: string): { title: string; company: string } {
  const trimmed = headline.trim();
  if (!trimmed) return { title: "", company: "" };
  const at = trimmed.match(/^(.*?)\s+at\s+(.+)$/i);
  if (at) return { title: at[1].trim(), company: at[2].trim() };
  const dot = trimmed.split(/\s*[·|]\s*/);
  if (dot.length >= 2) return { title: dot[0].trim(), company: dot.slice(1).join(" ").trim() };
  return { title: trimmed, company: "" };
}

function splitName(full: string): { first: string; last: string } {
  const bits = full.trim().split(/\s+/).filter(Boolean);
  if (bits.length === 0) return { first: "", last: "" };
  if (bits.length === 1) return { first: bits[0], last: "" };
  return { first: bits[0], last: bits.slice(1).join(" ") };
}

function looksLikeSlugName(name: string, url: string | null): boolean {
  if (!name.trim() || !url) return !name.trim();
  const slug = url.replace(/^https:\/\/www\.linkedin\.com\/in\//, "").split("/")[0] ?? "";
  const guessed = slug
    .split("-")
    .filter((part) => part && !/^\d+$/.test(part))
    .join(" ")
    .toLowerCase();
  return name.trim().toLowerCase() === guessed;
}

/** Fill empty merge fields from a LinkedIn profile lookup. Does not invent an opener. */
export function applyProfileToDraft(row: LeadDraft, profile: ProfileLookup): LeadDraft {
  const parsed = parseHeadline(profile.headline ?? "");
  const fromName = splitName(profile.name ?? "");
  const firstName = profile.firstName?.trim() || fromName.first;
  const lastName = profile.lastName?.trim() || fromName.last;
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || (profile.name ?? "").trim();
  const replaceName = !row.fullName.trim() || looksLikeSlugName(row.fullName, row.linkedinUrlNormalized ?? row.linkedinUrl);
  return {
    ...row,
    firstName: replaceName && firstName ? firstName : row.firstName,
    lastName: replaceName && (firstName || lastName) ? lastName : row.lastName,
    fullName: replaceName && fullName ? fullName : row.fullName,
    company: row.company.trim() ? row.company : profile.company?.trim() || parsed.company,
    title: row.title.trim() ? row.title : profile.title?.trim() || parsed.title,
    headline: row.headline.trim() ? row.headline : (profile.headline ?? "").trim(),
    location: row.location.trim() ? row.location : (profile.location ?? "").trim(),
    about: row.about.trim() ? row.about : (profile.about ?? "").trim(),
    publicUrl: row.publicUrl || profile.profileUrl || row.linkedinUrlNormalized || row.linkedinUrl,
  };
}
