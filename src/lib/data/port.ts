export type LeadSearchHit = {
  firstName: string;
  lastName: string;
  fullName: string;
  company: string;
  title: string;
  email: string | null;
  linkedinUrl: string | null;
  publicUrl: string | null;
  openingLine: string;
  source?: string;
};

export type DataPort = {
  searchPeople(input: { brief: string; limit: number; people?: LeadSearchHit[] }): Promise<LeadSearchHit[]>;
  researchLead(lead: LeadSearchHit): Promise<{ openingLine: string; publicUrl: string; notes: string }>;
};

export function hitToResearchInput(lead: {
  firstName: string;
  lastName: string;
  fullName: string;
  company: string;
  title: string;
  email: string | null;
  linkedinUrl: string | null;
  publicUrl: string | null;
  openingLine: string;
}): LeadSearchHit {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    fullName: lead.fullName,
    company: lead.company,
    title: lead.title,
    email: lead.email,
    linkedinUrl: lead.linkedinUrl,
    publicUrl: lead.publicUrl,
    openingLine: lead.openingLine,
    source: "source" in lead && typeof lead.source === "string" ? lead.source : undefined,
  };
}
