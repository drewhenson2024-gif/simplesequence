import { z } from "zod";
import type { AppContext } from "../app/commands";
import {
  addLeadsToCampaign,
  connectAccount,
  connectStatus,
  createCampaign,
  getCampaign,
  getInbox,
  importLeads,
  listCampaigns,
  pauseCampaign,
  resumeCampaign,
  startCampaign,
  stopLead,
} from "../app/commands";

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
        channel: z.enum(["linkedin", "email"]),
        action: z.enum(["connection", "message", "email"]),
        delayHours: z.number().nonnegative(),
        bodyTemplate: z.string(),
        subjectTemplate: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

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
