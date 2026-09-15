import { z } from "zod";
import type { AppContext } from "../app/commands";
import {
  addLeadsToCampaign,
  applyLearnings,
  connectAccount,
  connectStatus,
  createCampaign,
  exportLeadsToCrm,
  getCampaign,
  getInbox,
  importLeads,
  ingestSignals,
  listCampaigns,
  listSignals,
  pauseCampaign,
  promptToCampaign,
  qualifyLeads,
  researchLeads,
  resumeCampaign,
  searchPeople,
  startCampaign,
  stopLead,
  suggestLearnings,
} from "../app/commands";
import { SIGNAL_TYPES } from "../signals/catalog";

const importSchema = z.object({
  list_id: z.string().optional(),
  list_name: z.string().optional(),
  content: z.string().min(1),
  format: z.enum(["csv", "markdown", "auto"]).optional(),
});

const createCampaignSchema = z.object({
  name: z.string().min(1),
  template_key: z.enum(["linkedin_only", "email_only", "mixed"]).optional(),
  linkedin_sender_id: z.string().nullable().optional(),
  email_sender_id: z.string().nullable().optional(),
  steps: z
    .array(
      z.object({
        stepIndex: z.number().int().nonnegative(),
        channel: z.enum(["linkedin", "email", "gift"]),
        action: z.enum(["connection", "message", "email", "gift"]),
        delayHours: z.number().nonnegative(),
        bodyTemplate: z.string(),
        subjectTemplate: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        giftItem: z.string().nullable().optional(),
        giftNote: z.string().nullable().optional(),
        enabled: z.boolean().optional(),
        skipOverdueHours: z.number().int().nonnegative().optional(),
      }),
    )
    .optional(),
});

const personHitSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  email: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  publicUrl: z.string().nullable().optional(),
  openingLine: z.string().optional(),
});

const searchPeopleSchema = z.object({
  brief: z.string().min(1),
  limit: z.number().int().positive().optional(),
  list_name: z.string().optional(),
  people: z.array(personHitSchema).optional(),
});

const listIdSchema = z.object({ list_id: z.string() });

const qualifySchema = z.object({
  list_id: z.string(),
  criteria: z.string().min(1),
});

const promptSchema = z.object({
  brief: z.string().min(1),
  limit: z.number().int().positive().optional(),
  name: z.string().optional(),
  template_key: z.enum(["linkedin_only", "email_only", "mixed"]).optional(),
  people: z.array(personHitSchema).optional(),
});

function toHits(people?: z.infer<typeof personHitSchema>[]) {
  return people?.map((p) => ({
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: p.fullName ?? `${p.firstName} ${p.lastName}`.trim(),
    company: p.company ?? "",
    title: p.title ?? "",
    email: p.email ?? null,
    linkedinUrl: p.linkedinUrl ?? null,
    publicUrl: p.publicUrl ?? null,
    openingLine: p.openingLine ?? "",
  }));
}

const addLeadsSchema = z.object({
  campaign_id: z.string(),
  list_id: z.string().optional(),
  content: z.string().optional(),
  format: z.enum(["csv", "markdown", "auto"]).optional(),
});

const idSchema = z.object({ campaign_id: z.string() });
const stopSchema = z.object({ enrollment_id: z.string() });

export const MCP_TOOLS = [
  {
    name: "import_leads",
    description: "Import CSV or Markdown people into a list. Dedupe on LinkedIn URL then email.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string" },
        list_id: { type: "string" },
        list_name: { type: "string" },
        format: { type: "string", enum: ["csv", "markdown", "auto"] },
      },
      required: ["content"],
    },
  },
  {
    name: "create_campaign",
    description: "Create a campaign. Always saved as draft. Never sends.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        template_key: { type: "string", enum: ["linkedin_only", "email_only", "mixed"] },
        steps: { type: "array" },
      },
      required: ["name"],
    },
  },
  {
    name: "add_leads_to_campaign",
    description: "Enroll a list or inline rows onto a campaign as pending.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        list_id: { type: "string" },
        content: { type: "string" },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "get_campaign",
    description: "Get campaign steps, enrollments, and sample merge-field previews.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      required: ["campaign_id"],
    },
  },
  {
    name: "list_campaigns",
    description: "List campaigns in the workspace.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "start_campaign",
    description: "Explicit human/agent start. Drafts do not send without this.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      required: ["campaign_id"],
    },
  },
  {
    name: "pause_campaign",
    description: "Pause a running campaign.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      required: ["campaign_id"],
    },
  },
  {
    name: "resume_campaign",
    description: "Resume a paused campaign.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      required: ["campaign_id"],
    },
  },
  {
    name: "connect_status",
    description: "Sender accounts and health.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_inbox",
    description: "Inbound and outbound messages.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "stop_lead",
    description: "Stop remaining steps for one enrollment.",
    inputSchema: {
      type: "object",
      properties: { enrollment_id: { type: "string" } },
      required: ["enrollment_id"],
    },
  },
  {
    name: "search_people",
    description:
      "Search people from a targeting brief. Uses Apollo People API Search when APOLLO_API_KEY is set; otherwise a stub catalog. Draft people only. Never sends.",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "string" },
        limit: { type: "number" },
        list_name: { type: "string" },
      },
      required: ["brief"],
    },
  },
  {
    name: "research_leads",
    description: "Fill opening_line and public_url for every person on a list. Never sends.",
    inputSchema: {
      type: "object",
      properties: { list_id: { type: "string" } },
      required: ["list_id"],
    },
  },
  {
    name: "qualify_leads",
    description: "Qualify a list against criteria. Stores fit/maybe/no plus explanation per person. Never sends.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: "string" },
        criteria: { type: "string" },
      },
      required: ["list_id", "criteria"],
    },
  },
  {
    name: "prompt_to_campaign",
    description:
      "Search, research, and save a personalized campaign draft from a brief. Always draft. Never sends.",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "string" },
        limit: { type: "number" },
        name: { type: "string" },
        template_key: { type: "string", enum: ["linkedin_only", "email_only", "mixed"] },
      },
      required: ["brief"],
    },
  },
  {
    name: "export_leads",
    description: "Write a CRM-ready payload for a list (HubSpot later if a key exists). Never sends LinkedIn/email.",
    inputSchema: {
      type: "object",
      properties: { list_id: { type: "string" } },
      required: ["list_id"],
    },
  },
  {
    name: "list_signals",
    description: "In-market signals this week (hiring, funding, social, tool switch). Never sends.",
    inputSchema: {
      type: "object",
      properties: { since_days: { type: "number" } },
    },
  },
  {
    name: "ingest_signals",
    description: "Ingest provided signals or seed stub catalog demo signals. Never scrapes Sales Nav. Never sends.",
    inputSchema: { type: "object", properties: { signals: { type: "array" } } },
  },
  {
    name: "suggest_learnings",
    description: "Suggest copy/step changes from sent jobs + replies. Never starts a campaign.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      required: ["campaign_id"],
    },
  },
  {
    name: "apply_learnings",
    description: "Apply winning patterns as a new draft campaign. Never mutates a running sequence. Never auto-starts.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      required: ["campaign_id"],
    },
  },
] as const;

export async function callMcpTool(
  ctx: AppContext,
  name: string,
  args: unknown,
): Promise<unknown> {
  switch (name) {
    case "import_leads": {
      const input = importSchema.parse(args);
      return importLeads(ctx, {
        listId: input.list_id,
        listName: input.list_name,
        content: input.content,
        format: input.format,
      });
    }
    case "create_campaign": {
      const input = createCampaignSchema.parse(args);
      return createCampaign(ctx, {
        name: input.name,
        templateKey: input.template_key,
        linkedinSenderId: input.linkedin_sender_id,
        emailSenderId: input.email_sender_id,
        steps: input.steps?.map((s) => ({
          ...s,
          subjectTemplate: s.subjectTemplate ?? null,
          giftItem: s.giftItem ?? null,
          giftNote: s.giftNote ?? null,
        })),
      });
    }
    case "add_leads_to_campaign": {
      const input = addLeadsSchema.parse(args);
      return addLeadsToCampaign(ctx, input.campaign_id, {
        listId: input.list_id,
        content: input.content,
        format: input.format,
      });
    }
    case "get_campaign":
      return getCampaign(ctx, idSchema.parse(args).campaign_id);
    case "list_campaigns":
      return listCampaigns(ctx);
    case "start_campaign":
      return startCampaign(ctx, idSchema.parse(args).campaign_id);
    case "pause_campaign":
      return pauseCampaign(ctx, idSchema.parse(args).campaign_id);
    case "resume_campaign":
      return resumeCampaign(ctx, idSchema.parse(args).campaign_id);
    case "connect_status":
      return connectStatus(ctx);
    case "get_inbox":
      return getInbox(ctx);
    case "stop_lead":
      return stopLead(ctx, stopSchema.parse(args).enrollment_id);
    case "search_people": {
      const input = searchPeopleSchema.parse(args);
      return searchPeople(ctx, {
        brief: input.brief,
        limit: input.limit,
        listName: input.list_name,
        people: toHits(input.people),
      });
    }
    case "research_leads":
      return researchLeads(ctx, listIdSchema.parse(args).list_id);
    case "qualify_leads": {
      const input = qualifySchema.parse(args);
      return qualifyLeads(ctx, input.list_id, input.criteria);
    }
    case "prompt_to_campaign": {
      const input = promptSchema.parse(args);
      return promptToCampaign(ctx, {
        brief: input.brief,
        limit: input.limit,
        name: input.name,
        templateKey: input.template_key,
        people: toHits(input.people),
      });
    }
    case "export_leads":
      return exportLeadsToCrm(ctx, listIdSchema.parse(args).list_id);
    case "list_signals": {
      const input = z.object({ since_days: z.number().int().positive().optional() }).parse(args ?? {});
      return listSignals(ctx, { sinceDays: input.since_days });
    }
    case "ingest_signals": {
      const input = z
        .object({
          signals: z
            .array(
              z.object({
                type: z.enum(SIGNAL_TYPES),
                title: z.string(),
                detail: z.string().optional(),
                company: z.string().optional(),
                personName: z.string().optional(),
                source: z.string().optional(),
                occurredAt: z.string().optional(),
                leadId: z.string().optional(),
              }),
            )
            .optional(),
        })
        .parse(args ?? {});
      return ingestSignals(ctx, input);
    }
    case "suggest_learnings":
      return suggestLearnings(ctx, idSchema.parse(args).campaign_id);
    case "apply_learnings":
      return applyLearnings(ctx, idSchema.parse(args).campaign_id);
    case "connect_linkedin":
      return connectAccount(ctx, "linkedin");
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function mcpInitializeResult() {
  return {
    protocolVersion: "2025-03-26",
    capabilities: { tools: {} },
    serverInfo: { name: "simplesequence", version: "0.1.0" },
  };
}
