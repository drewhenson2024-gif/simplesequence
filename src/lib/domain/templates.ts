export type SequenceChannel = "linkedin";
export type SequenceAction = "connection" | "message";

export type SequenceStepDraft = {
  stepIndex: number;
  channel: SequenceChannel;
  action: SequenceAction;
  delayHours: number;
  bodyTemplate: string;
  subjectTemplate: string | null;
  enabled?: boolean;
  skipOverdueHours?: number;
  imageUrl?: string | null;
};

export type TemplateKey = "linkedin_only";

export type LeadFields = {
  firstName: string;
  lastName: string;
  fullName: string;
  company: string;
  title: string;
  headline: string;
  location: string;
  about: string;
  openingLine: string;
  email: string | null;
  linkedinUrl: string | null;
  profileUrl: string | null;
};

export type VariableGroup = { heading: string; fields: readonly string[] };

/** Identity / Role / About, A–Z inside each group. */
export const VARIABLE_GROUPS: readonly VariableGroup[] = [
  { heading: "Identity", fields: ["first_name", "full_name", "last_name"] },
  { heading: "Role", fields: ["company", "headline", "location", "title"] },
  { heading: "About", fields: ["about", "profile_url"] },
];

export function renderTemplate(template: string, lead: LeadFields): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => {
    const k = key.toLowerCase();
    switch (k) {
      case "first_name":
        return lead.firstName;
      case "last_name":
        return lead.lastName;
      case "full_name":
        return lead.fullName;
      case "company":
        return lead.company;
      case "title":
        return lead.title;
      case "headline":
        return lead.headline;
      case "location":
        return lead.location;
      case "about":
        return lead.about;
      case "profile_url":
        return lead.profileUrl || lead.linkedinUrl || "";
      case "opening_line":
        return lead.openingLine;
      default:
        return "";
    }
  });
}

export function templateVariables(): readonly string[] {
  return VARIABLE_GROUPS.flatMap((group) => group.fields);
}

export function stepsForTemplate(_key: TemplateKey = "linkedin_only"): SequenceStepDraft[] {
  return [
    {
      stepIndex: 0,
      channel: "linkedin",
      action: "connection",
      delayHours: 0,
      bodyTemplate: "Hi {{first_name}} — {{title}} at {{company}}",
      subjectTemplate: null,
    },
    {
      stepIndex: 1,
      channel: "linkedin",
      action: "message",
      delayHours: 24,
      bodyTemplate: "Hi {{first_name}}, following up from {{company}}. Would love 15 minutes if useful.",
      subjectTemplate: null,
    },
    {
      stepIndex: 2,
      channel: "linkedin",
      action: "message",
      delayHours: 72,
      bodyTemplate: "Hi {{first_name}}, last note from me. Happy to close the loop if now is not the time.",
      subjectTemplate: null,
    },
  ];
}
