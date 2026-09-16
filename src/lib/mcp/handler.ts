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
  listCampaigns,
  listLists,
  getList,
  pauseCampaign,
  removeLeadFromList,
  replyToLead,
  resumeCampaign,
  startCampaign,
  stopLead,
  suggestLearnings,
  updateCampaign,
  updateList,
  deleteCampaign,
  deleteList,
  workspaceAnalytics,
} from "../app/commands";

const importSchema = z
  .object({
    list_id: z.string().optional(),
    list_name: z.string().optional(),
    content: z.string().optional(),
    urls: z.array(z.string()).optional(),
    format: z.enum(["csv", "markdown", "urls", "auto"]).optional(),
  })
  .refine((d) => Boolean(d.content?.trim()) || Boolean(d.urls?.some((u) => u.trim())), {
    message: "urls or content required",
  });

const createCampaignSchema = z.object({
  name: z.string().min(1),
  template_key: z.enum(["linkedin_only"]).optional(),
  linkedin_sender_id: z.string().nullable().optional(),
  steps: z
    .array(
      z.object({
        stepIndex: z.number().int().nonnegative(),
        channel: z.enum(["linkedin"]),
        action: z.enum(["connection", "message"]),
        delayHours: z.number().nonnegative(),
        bodyTemplate: z.string(),
        subjectTemplate: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        enabled: z.boolean().optional(),
        skipOverdueHours: z.number().int().nonnegative().optional(),
      }),
    )
    .optional(),
});

const listIdSchema = z.object({ list_id: z.string() });
const updateListSchema = z.object({ list_id: z.string(), name: z.string().min(1) });
const removeLeadSchema = z.object({ list_id: z.string(), lead_id: z.string() });

const addLeadsSchema = z.object({
  campaign_id: z.string(),
  list_id: z.string().optional(),
  content: z.string().optional(),
  urls: z.array(z.string()).optional(),
  format: z.enum(["csv", "markdown", "urls", "auto"]).optional(),
});

const idSchema = z.object({ campaign_id: z.string() });
const stopSchema = z.object({ enrollment_id: z.string() });
const replySchema = z.object({
  enrollment_id: z.string(),
  body: z.string().min(1),
  channel: z.enum(["linkedin"]).optional(),
});
const updateCampaignSchema = z.object({
  campaign_id: z.string(),
  name: z.string().optional(),
  linkedin_sender_id: z.string().nullable().optional(),
  steps: createCampaignSchema.shape.steps,
});

export const MCP_TOOLS = [
  {
    name: "import_leads",
    description:
      "Add people by LinkedIn profile URL. Prefer urls: string[]. Looks up name, title, company, headline, location, and about from each profile (Unipile). Never searches or sends.",
    inputSchema: {
      type: "object",
      properties: {
        urls: { type: "array", items: { type: "string" }, description: "LinkedIn profile URLs" },
        content: { type: "string", description: "Optional paste: one LinkedIn URL per line" },
        list_id: { type: "string" },
        list_name: { type: "string" },
      },
    },
  },
  {
    name: "list_lists",
    description: "List people lists (LinkedIn URL lists) in the workspace. Never sends.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_list",
    description: "Get one people list and its LinkedIn profile URLs. Never sends.",
    inputSchema: {
      type: "object",
      properties: { list_id: { type: "string" } },
      required: ["list_id"],
    },
  },
  {
    name: "update_list",
    description: "Rename a people list. Never sends.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: "string" },
        name: { type: "string" },
      },
      required: ["list_id", "name"],
    },
  },
  {
    name: "remove_lead_from_list",
    description: "Remove one person from a list. Does not stop them in a sequence. Never sends.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: "string" },
        lead_id: { type: "string" },
      },
      required: ["list_id", "lead_id"],
    },
  },
  {
    name: "delete_list",
    description: "Delete a people list. People already enrolled in a sequence stay there. Never sends.",
    inputSchema: {
      type: "object",
      properties: { list_id: { type: "string" } },
      required: ["list_id"],
    },
  },
  {
    name: "create_campaign",
    description: "Create a campaign. Always saved as draft. Never sends.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        template_key: { type: "string", enum: ["linkedin_only"] },
        steps: { type: "array" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_campaign",
    description: "Edit a draft sequence (name or steps). Running sequences cannot be edited. Never sends.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        name: { type: "string" },
        steps: { type: "array" },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "delete_campaign",
    description: "Delete a draft sequence. Running or paused sequences cannot be deleted — pause instead. Never sends.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      required: ["campaign_id"],
    },
  },
  {
    name: "add_leads_to_campaign",
    description: "Enroll a list or LinkedIn profile URLs onto a campaign as pending. Never sends.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        list_id: { type: "string" },
        urls: { type: "array", items: { type: "string" } },
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
    name: "reply_inbox",
    description: "Reply to one person in inbox. Does not start a campaign. Sandbox still dry-runs.",
    inputSchema: {
      type: "object",
      properties: {
        enrollment_id: { type: "string" },
        body: { type: "string" },
        channel: { type: "string", enum: ["linkedin"] },
      },
      required: ["enrollment_id", "body"],
    },
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
    name: "export_leads",
    description: "Write a CRM-ready payload for a list (HubSpot later if a key exists). Never sends LinkedIn/email.",
    inputSchema: {
      type: "object",
      properties: { list_id: { type: "string" } },
      required: ["list_id"],
    },
  },
  {
    name: "get_analytics",
    description: "Workspace stats board: sent, skipped, replies, reply rate. Zeros when nothing has sent. Never sends.",
    inputSchema: { type: "object", properties: {} },
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
        urls: input.urls,
        format: input.format,
      });
    }
    case "list_lists":
      return listLists(ctx);
    case "get_list":
      return getList(ctx, listIdSchema.parse(args).list_id);
    case "update_list": {
      const input = updateListSchema.parse(args);
      return updateList(ctx, input.list_id, { name: input.name });
    }
    case "remove_lead_from_list": {
      const input = removeLeadSchema.parse(args);
      return removeLeadFromList(ctx, input.list_id, input.lead_id);
    }
    case "delete_list":
      return deleteList(ctx, listIdSchema.parse(args).list_id);
    case "create_campaign": {
      const input = createCampaignSchema.parse(args);
      return createCampaign(ctx, {
        name: input.name,
        templateKey: input.template_key,
        linkedinSenderId: input.linkedin_sender_id,
        steps: input.steps?.map((s) => ({
          ...s,
          subjectTemplate: s.subjectTemplate ?? null,
        })),
      });
    }
    case "update_campaign": {
      const input = updateCampaignSchema.parse(args);
      return updateCampaign(ctx, input.campaign_id, {
        name: input.name,
        linkedinSenderId: input.linkedin_sender_id,
        steps: input.steps?.map((s) => ({
          ...s,
          subjectTemplate: s.subjectTemplate ?? null,
        })),
      });
    }
    case "delete_campaign":
      return deleteCampaign(ctx, idSchema.parse(args).campaign_id);
    case "add_leads_to_campaign": {
      const input = addLeadsSchema.parse(args);
      return addLeadsToCampaign(ctx, input.campaign_id, {
        listId: input.list_id,
        content: input.content,
        urls: input.urls,
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
    case "reply_inbox": {
      const input = replySchema.parse(args);
      return replyToLead(ctx, {
        enrollmentId: input.enrollment_id,
        body: input.body,
        channel: input.channel,
      });
    }
    case "stop_lead":
      return stopLead(ctx, stopSchema.parse(args).enrollment_id);
    case "export_leads":
      return exportLeadsToCrm(ctx, listIdSchema.parse(args).list_id);
    case "get_analytics":
      return workspaceAnalytics(ctx);
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
