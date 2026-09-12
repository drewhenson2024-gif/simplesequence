export type SequenceChannel = "linkedin" | "email";
export type SequenceAction = "connection" | "message" | "email";

export type SequenceStepDraft = {
  stepIndex: number;
  channel: SequenceChannel;
  action: SequenceAction;
  delayHours: number;
  bodyTemplate: string;
  subjectTemplate: string | null;
};

export type TemplateKey = "linkedin_only" | "email_only" | "mixed";

export type LeadFields = {
  firstName: string;
  lastName: string;
  fullName: string;
  company: string;
  title: string;
  openingLine: string;
  email: string | null;
  linkedinUrl: string | null;
};

const VARS = ["first_name", "company", "title", "opening_line", "last_name", "full_name"] as const;

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
      case "opening_line":
        return lead.openingLine;
      default:
        return "";
    }
  });
}

export function templateVariables(): readonly string[] {
  return VARS;
}

export function stepsForTemplate(key: TemplateKey): SequenceStepDraft[] {
  if (key === "linkedin_only") {
    return [
      {
        stepIndex: 0,
        channel: "linkedin",
        action: "connection",
        delayHours: 0,
        bodyTemplate: "Hi {{first_name}} — {{opening_line}}",
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
  if (key === "email_only") {
    return [
      {
        stepIndex: 0,
        channel: "email",
        action: "email",
        delayHours: 0,
        bodyTemplate: "Hi {{first_name}},\n\n{{opening_line}}\n\nWorth a short call?",
        subjectTemplate: "{{first_name}} / {{company}}",
      },
      {
        stepIndex: 1,
        channel: "email",
        action: "email",
        delayHours: 72,
        bodyTemplate: "Hi {{first_name}}, bumping this in case it landed at a busy time.",
        subjectTemplate: "Re: {{company}}",
      },
    ];
  }
  return [
    {
      stepIndex: 0,
      channel: "linkedin",
      action: "connection",
      delayHours: 0,
      bodyTemplate: "Hi {{first_name}} — {{opening_line}}",
      subjectTemplate: null,
    },
    {
      stepIndex: 1,
      channel: "linkedin",
      action: "message",
      delayHours: 24,
      bodyTemplate: "Thanks for connecting, {{first_name}}. {{opening_line}}",
      subjectTemplate: null,
    },
    {
      stepIndex: 2,
      channel: "email",
      action: "email",
      delayHours: 48,
      bodyTemplate: "Hi {{first_name}},\n\nTried you on LinkedIn as well. {{opening_line}}",
      subjectTemplate: "{{first_name}} — {{company}}",
    },
  ];
}
