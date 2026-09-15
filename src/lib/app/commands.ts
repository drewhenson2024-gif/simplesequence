import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import type { Client } from "@libsql/client";
import type { Db } from "../db/client";
import * as tables from "../db/schema";
import {
  asCampaignId,
  asEnrollmentId,
  asListId,
  asSenderId,
  DEFAULT_WORKSPACE_ID,
  newId,
  type CampaignId,
  type EnrollmentId,
  type LeadId,
  type ListId,
  type SenderId,
  type WorkspaceId,
} from "../ids";
import {
  isTerminalEnrollment,
  transitionCampaign,
  transitionEnrollment,
  transitionJob,
  transitionSender,
  type CampaignStatus,
  type EnrollmentStatus,
  type JobStatus,
  type SenderStatus,
} from "../domain/fsm";
import { addJitter, inWorkingHours, nextWorkingSlot, type WorkingHours } from "../domain/jitter";
import {
  renderTemplate,
  stepsForTemplate,
  type LeadFields,
  type SequenceStepDraft,
  type TemplateKey,
} from "../domain/templates";
import { contentHash, parseLeads, type LeadDraft } from "../ingest/parser";
import { channelFromUnipileAccount, keysPresent, type UnipilePort } from "../unipile/port";
import { type DataPort, type LeadSearchHit, hitToResearchInput } from "../data/port";
import { StubData } from "../data/stub";
import { qualifyLead } from "../data/qualify";
import { WaterfallData } from "../data/waterfall";
import { MockGift, type GiftPort } from "../gift/port";
import { demoSignalsFromCatalog, SIGNAL_TYPES, type SignalType } from "../signals/catalog";

export type Clock = { now: () => Date };

export type AppContext = {
  db: Db;
  client: Client;
  unipile: UnipilePort;
  data?: DataPort;
  gift?: GiftPort;
  clock: Clock;
  actor: string;
  workspaceId: WorkspaceId;
};

export class CommandError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

function iso(d: Date): string {
  return d.toISOString();
}

async function getWorkspace(ctx: AppContext) {
  const rows = await ctx.db
    .select()
    .from(tables.workspaces)
    .where(eq(tables.workspaces.id, ctx.workspaceId))
    .limit(1);
  const ws = rows[0];
  if (!ws) throw new CommandError("workspace not found", 404);
  return ws;
}

function hoursOf(ws: Awaited<ReturnType<typeof getWorkspace>>): WorkingHours {
  return {
    timezone: ws.timezone,
    startHour: ws.workingStartHour,
    endHour: ws.workingEndHour,
    weekends: Boolean(ws.weekendsEnabled),
  };
}

async function audit(ctx: AppContext, action: string, payload: unknown): Promise<void> {
  await ctx.db.insert(tables.auditLog).values({
    id: newId("aud"),
    workspaceId: ctx.workspaceId,
    actor: ctx.actor,
    action,
    payloadJson: JSON.stringify(payload),
    createdAt: iso(ctx.clock.now()),
  });
}

async function outbox(ctx: AppContext, topic: string, payload: unknown): Promise<void> {
  await ctx.db.insert(tables.outbox).values({
    id: newId("obx"),
    workspaceId: ctx.workspaceId,
    topic,
    payloadJson: JSON.stringify(payload),
    processedAt: null,
    createdAt: iso(ctx.clock.now()),
  });
}

function mergeDraft(existing: typeof tables.leads.$inferSelect, incoming: LeadDraft) {
  const custom = {
    ...(JSON.parse(existing.customJson || "{}") as Record<string, string>),
    ...incoming.custom,
  };
  return {
    firstName: existing.firstName || incoming.firstName,
    lastName: existing.lastName || incoming.lastName,
    fullName: existing.fullName || incoming.fullName,
    company: existing.company || incoming.company,
    title: existing.title || incoming.title,
    email: existing.email || incoming.email,
    linkedinUrl: existing.linkedinUrl || incoming.linkedinUrl,
    linkedinUrlNormalized: existing.linkedinUrlNormalized || incoming.linkedinUrlNormalized,
    openingLine: existing.openingLine || incoming.openingLine,
    publicUrl: existing.publicUrl || incoming.publicUrl,
    customJson: JSON.stringify(custom),
  };
}

export type ImportCounts = {
  imported: number;
  merged: number;
  skipped: number;
  invalid: number;
};

export async function importLeads(
  ctx: AppContext,
  input: {
    listId?: string;
    listName?: string;
    content: string;
    format?: "csv" | "markdown" | "auto";
  },
): Promise<{ listId: ListId; name: string; counts: ImportCounts }> {
  const now = iso(ctx.clock.now());
  const parsed = parseLeads(input.content, input.format ?? "auto");
  const hash = contentHash(`${input.listId ?? ""}:${input.content}`);
  const cached = await ctx.db
    .select()
    .from(tables.idempotencyKeys)
    .where(eq(tables.idempotencyKeys.key, hash))
    .limit(1);
  if (cached[0]) {
    return JSON.parse(cached[0].resultJson) as { listId: ListId; name: string; counts: ImportCounts };
  }

  let listId = input.listId ? asListId(input.listId) : (newId("lst") as ListId);
  let listName = input.listName ?? "Imported list";
  const existingList = input.listId
    ? await ctx.db.select().from(tables.lists).where(eq(tables.lists.id, input.listId)).limit(1)
    : [];
  if (input.listId && !existingList[0]) throw new CommandError("list not found", 404);
  if (existingList[0]) {
    listId = asListId(existingList[0].id);
    listName = existingList[0].name;
    const raw = existingList[0].rawImport ? `${existingList[0].rawImport}\n\n${input.content}` : input.content;
    await ctx.db.update(tables.lists).set({ rawImport: raw }).where(eq(tables.lists.id, listId));
  } else {
    await ctx.db.insert(tables.lists).values({
      id: listId,
      workspaceId: ctx.workspaceId,
      name: listName,
      rawImport: input.content,
      createdAt: now,
    });
  }

  const membership = await ctx.db
    .select()
    .from(tables.listLeads)
    .where(eq(tables.listLeads.listId, listId));
  const memberIds = membership.map((m) => m.leadId);
  const members =
    memberIds.length === 0
      ? []
      : await ctx.db.select().from(tables.leads).where(inArray(tables.leads.id, memberIds));

  const counts: ImportCounts = { imported: 0, merged: 0, skipped: 0, invalid: 0 };

  for (const row of parsed.rows) {
    if (!row.valid) {
      counts.invalid += 1;
      continue;
    }
    const match = members.find((m) => {
      if (row.linkedinUrlNormalized && m.linkedinUrlNormalized === row.linkedinUrlNormalized) return true;
      if (row.email && m.email && m.email === row.email) return true;
      return false;
    });
    if (match) {
      const merged = mergeDraft(match, row);
      await ctx.db.update(tables.leads).set(merged).where(eq(tables.leads.id, match.id));
      Object.assign(match, merged);
      counts.merged += 1;
      continue;
    }
    const leadId = newId("led") as LeadId;
    const created = {
      id: leadId,
      workspaceId: ctx.workspaceId,
      firstName: row.firstName,
      lastName: row.lastName,
      fullName: row.fullName,
      company: row.company,
      title: row.title,
      email: row.email,
      linkedinUrl: row.linkedinUrl,
      linkedinUrlNormalized: row.linkedinUrlNormalized,
      openingLine: row.openingLine,
      publicUrl: row.publicUrl,
      customJson: JSON.stringify(row.custom),
      createdAt: now,
    };
    await ctx.db.insert(tables.leads).values(created);
    await ctx.db.insert(tables.listLeads).values({ listId, leadId });
    members.push(created);
    counts.imported += 1;
  }

  counts.skipped = 0;
  const result = { listId, name: listName, counts };
  await ctx.db.insert(tables.idempotencyKeys).values({
    key: hash,
    workspaceId: ctx.workspaceId,
    resultJson: JSON.stringify(result),
    createdAt: now,
  });
  await audit(ctx, "import_leads", { listId, counts, hash });
  return result;
}

export async function listLists(ctx: AppContext) {
  const rows = await ctx.db.select().from(tables.lists).where(eq(tables.lists.workspaceId, ctx.workspaceId));
  const out = [];
  for (const list of rows) {
    const members = await ctx.db
      .select()
      .from(tables.listLeads)
      .where(eq(tables.listLeads.listId, list.id));
    out.push({ ...list, leadCount: members.length });
  }
  return out;
}

export async function getList(ctx: AppContext, listId: string) {
  const rows = await ctx.db.select().from(tables.lists).where(eq(tables.lists.id, listId)).limit(1);
  const list = rows[0];
  if (!list) throw new CommandError("list not found", 404);
  const membership = await ctx.db
    .select()
    .from(tables.listLeads)
    .where(eq(tables.listLeads.listId, listId));
  const ids = membership.map((m) => m.leadId);
  const leadRows =
    ids.length === 0 ? [] : await ctx.db.select().from(tables.leads).where(inArray(tables.leads.id, ids));
  return { ...list, leads: leadRows };
}

export async function createCampaign(
  ctx: AppContext,
  input: {
    name: string;
    templateKey?: TemplateKey;
    steps?: SequenceStepDraft[];
    linkedinSenderId?: string | null;
    emailSenderId?: string | null;
  },
): Promise<{ id: CampaignId; status: "draft" }> {
  const now = iso(ctx.clock.now());
  const id = newId("cmp") as CampaignId;
  const steps = input.steps?.length
    ? input.steps
    : stepsForTemplate(input.templateKey ?? "mixed");
  await ctx.db.insert(tables.campaigns).values({
    id,
    workspaceId: ctx.workspaceId,
    name: input.name,
    status: "draft",
    templateKey: input.templateKey ?? "mixed",
    linkedinSenderId: input.linkedinSenderId ?? null,
    emailSenderId: input.emailSenderId ?? null,
    giftSenderId: null,
    createdAt: now,
  });
  for (const step of steps) {
    await ctx.db.insert(tables.sequenceSteps).values({
      id: newId("stp"),
      campaignId: id,
      stepIndex: step.stepIndex,
      channel: step.channel,
      action: step.action,
      delayHours: step.delayHours,
      bodyTemplate: step.bodyTemplate,
      subjectTemplate: step.subjectTemplate,
      enabled: step.enabled === false ? 0 : 1,
      skipOverdueHours: step.skipOverdueHours ?? 72,
      imageUrl: step.imageUrl ?? null,
      giftItem: step.giftItem ?? null,
      giftNote: step.giftNote ?? null,
    });
  }
  await audit(ctx, "create_campaign", { campaignId: id, name: input.name, status: "draft" });
  return { id, status: "draft" };
}

export async function updateCampaign(
  ctx: AppContext,
  campaignId: string,
  input: {
    name?: string;
    steps?: SequenceStepDraft[];
    linkedinSenderId?: string | null;
    emailSenderId?: string | null;
  },
) {
  const [campaign] = await ctx.db
    .select()
    .from(tables.campaigns)
    .where(eq(tables.campaigns.id, campaignId))
    .limit(1);
  if (!campaign) throw new CommandError("campaign not found", 404);
  if (campaign.status !== "draft") throw new CommandError("only drafts can be edited", 409);
  await ctx.db
    .update(tables.campaigns)
    .set({
      name: input.name ?? campaign.name,
      linkedinSenderId: input.linkedinSenderId === undefined ? campaign.linkedinSenderId : input.linkedinSenderId,
      emailSenderId: input.emailSenderId === undefined ? campaign.emailSenderId : input.emailSenderId,
    })
    .where(eq(tables.campaigns.id, campaignId));
  if (input.steps) {
    await ctx.db.delete(tables.sequenceSteps).where(eq(tables.sequenceSteps.campaignId, campaignId));
    for (const step of input.steps) {
      await ctx.db.insert(tables.sequenceSteps).values({
        id: newId("stp"),
        campaignId,
        stepIndex: step.stepIndex,
        channel: step.channel,
        action: step.action,
        delayHours: step.delayHours,
        bodyTemplate: step.bodyTemplate,
        subjectTemplate: step.subjectTemplate,
        enabled: step.enabled === false ? 0 : 1,
        skipOverdueHours: step.skipOverdueHours ?? 72,
        imageUrl: step.imageUrl ?? null,
        giftItem: step.giftItem ?? null,
        giftNote: step.giftNote ?? null,
      });
    }
  }
  await audit(ctx, "update_campaign", { campaignId });
  return getCampaign(ctx, campaignId);
}

export async function addLeadsToCampaign(
  ctx: AppContext,
  campaignId: string,
  input: { listId?: string; content?: string; format?: "csv" | "markdown" | "auto" },
) {
  const [campaign] = await ctx.db
    .select()
    .from(tables.campaigns)
    .where(eq(tables.campaigns.id, campaignId))
    .limit(1);
  if (!campaign) throw new CommandError("campaign not found", 404);
  let listId = input.listId;
  if (input.content) {
    const imported = await importLeads(ctx, {
      listId: input.listId,
      listName: `Campaign ${campaign.name} leads`,
      content: input.content,
      format: input.format,
    });
    listId = imported.listId;
  }
  if (!listId) throw new CommandError("listId or content required");
  const list = await getList(ctx, listId);
  const now = iso(ctx.clock.now());
  let enrolled = 0;
  for (const lead of list.leads) {
    const existing = await ctx.db
      .select()
      .from(tables.enrollments)
      .where(and(eq(tables.enrollments.campaignId, campaignId), eq(tables.enrollments.leadId, lead.id)))
      .limit(1);
    if (existing[0]) continue;
    await ctx.db.insert(tables.enrollments).values({
      id: newId("enr") as EnrollmentId,
      campaignId,
      leadId: lead.id,
      status: "pending",
      nextStepIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    enrolled += 1;
  }
  await audit(ctx, "add_leads_to_campaign", { campaignId, listId, enrolled });
  return { enrolled, listId };
}

function leadFields(lead: typeof tables.leads.$inferSelect): LeadFields {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    fullName: lead.fullName,
    company: lead.company,
    title: lead.title,
    openingLine: lead.openingLine,
    email: lead.email,
    linkedinUrl: lead.linkedinUrlNormalized ?? lead.linkedinUrl,
  };
}

function leadCustom(lead: typeof tables.leads.$inferSelect | null): Record<string, unknown> {
  if (!lead) return {};
  try {
    return JSON.parse(lead.customJson || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function giftAddressOf(lead: typeof tables.leads.$inferSelect | null): string {
  const custom = leadCustom(lead);
  const fromCustom = [
    custom.office_address,
    custom.custom_office_address,
    custom.company_address,
    custom.custom_company_address,
    custom.address,
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .find(Boolean);
  return fromCustom || lead?.company?.trim() || "";
}

function missingChannelReason(
  step: { channel: string; action: string },
  lead: typeof tables.leads.$inferSelect | null,
): string | null {
  if (!lead) return "missing lead";
  if (step.action === "gift" || step.channel === "gift") {
    if (!giftAddressOf(lead)) return "no gift address";
    return null;
  }
  if (step.action === "email" || step.channel === "email") {
    if (!lead.email) return "no email";
  }
  if (step.action === "connection" || step.action === "message" || step.channel === "linkedin") {
    if (!(lead.linkedinUrlNormalized ?? lead.linkedinUrl)) return "no linkedin url";
  }
  return null;
}

export async function getCampaign(ctx: AppContext, campaignId: string) {
  const [campaign] = await ctx.db
    .select()
    .from(tables.campaigns)
    .where(eq(tables.campaigns.id, campaignId))
    .limit(1);
  if (!campaign) throw new CommandError("campaign not found", 404);
  const steps = await ctx.db
    .select()
    .from(tables.sequenceSteps)
    .where(eq(tables.sequenceSteps.campaignId, campaignId));
  steps.sort((a, b) => a.stepIndex - b.stepIndex);
  const enrollments = await ctx.db
    .select()
    .from(tables.enrollments)
    .where(eq(tables.enrollments.campaignId, campaignId));
  const counts: Record<string, number> = {};
  for (const e of enrollments) {
    counts[e.status] = (counts[e.status] ?? 0) + 1;
  }
  const leadIds = enrollments.map((e) => e.leadId);
  const leadRows =
    leadIds.length === 0 ? [] : await ctx.db.select().from(tables.leads).where(inArray(tables.leads.id, leadIds));
  const byId = new Map(leadRows.map((l) => [l.id, l]));
  const samples = leadRows.slice(0, 3).map((lead) => ({
    lead,
    previews: steps.map((step) => ({
      stepIndex: step.stepIndex,
      channel: step.channel,
      action: step.action,
      subject: step.subjectTemplate ? renderTemplate(step.subjectTemplate, leadFields(lead)) : null,
      body: renderTemplate(step.bodyTemplate, leadFields(lead)),
    })),
  }));
  const jobs = await ctx.db.select().from(tables.sendJobs).where(eq(tables.sendJobs.campaignId, campaignId));
  const jobCounts: Record<string, number> = {};
  for (const j of jobs) jobCounts[j.status] = (jobCounts[j.status] ?? 0) + 1;
  const enrollById = new Map(enrollments.map((e) => [e.id, e]));
  const stepByIndex = new Map(steps.map((s) => [s.stepIndex, s]));
  const jobRows = [...jobs].sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1)).map((job) => {
    const enrollment = enrollById.get(job.enrollmentId);
    const step = stepByIndex.get(job.stepIndex);
    return {
      ...job,
      channel: step?.channel ?? null,
      action: step?.action ?? null,
      skipReason: job.error,
      lead: enrollment ? byId.get(enrollment.leadId) ?? null : null,
    };
  });
  return {
    ...campaign,
    steps,
    enrollments: enrollments.map((e) => ({ ...e, lead: byId.get(e.leadId) ?? null })),
    enrollmentCounts: counts,
    jobCounts,
    jobs: jobRows,
    samples,
  };
}

export async function listCampaigns(ctx: AppContext) {
  const rows = await ctx.db
    .select()
    .from(tables.campaigns)
    .where(eq(tables.campaigns.workspaceId, ctx.workspaceId));
  const out = [];
  for (const c of rows) {
    const enrollments = await ctx.db
      .select()
      .from(tables.enrollments)
      .where(eq(tables.enrollments.campaignId, c.id));
    out.push({ ...c, enrollmentCount: enrollments.length });
  }
  return out;
}

async function ensureSandboxSender(ctx: AppContext, channel: "linkedin" | "email" | "gift"): Promise<SenderId> {
  const existing = await ctx.db
    .select()
    .from(tables.senderAccounts)
    .where(and(eq(tables.senderAccounts.workspaceId, ctx.workspaceId), eq(tables.senderAccounts.channel, channel)))
    .limit(1);
  if (existing[0]) return asSenderId(existing[0].id);
  const id = newId("snd") as SenderId;
  await ctx.db.insert(tables.senderAccounts).values({
    id,
    workspaceId: ctx.workspaceId,
    channel,
    status: "healthy",
    unipileAccountId: `mock_${channel}`,
    displayName:
      channel === "linkedin" ? "Sandbox LinkedIn" : channel === "gift" ? "Sandbox gifts" : "Sandbox mailbox",
    timezone: "America/Los_Angeles",
    lastError: null,
    createdAt: iso(ctx.clock.now()),
  });
  return id;
}

export async function startCampaign(ctx: AppContext, campaignId: string) {
  const campaign = await getCampaign(ctx, campaignId);
  const next = campaign.status === "paused" ? "running" : transitionCampaign(campaign.status as CampaignStatus, "running");
  const ws = await getWorkspace(ctx);
  if (ws.killSwitch) throw new CommandError("kill switch is on", 409);
  const needsLi = campaign.steps.some((s) => s.channel === "linkedin");
  const needsEmail = campaign.steps.some((s) => s.channel === "email");
  const needsGift = campaign.steps.some((s) => s.channel === "gift" || s.action === "gift");
  let liSender = campaign.linkedinSenderId;
  let emailSender = campaign.emailSenderId;
  let giftSender = campaign.giftSenderId;
  if (ws.sandbox) {
    if (needsLi && !liSender) liSender = await ensureSandboxSender(ctx, "linkedin");
    if (needsEmail && !emailSender) emailSender = await ensureSandboxSender(ctx, "email");
    if (needsGift && !giftSender) giftSender = await ensureSandboxSender(ctx, "gift");
  } else if (needsGift && !giftSender) {
    giftSender = await ensureSandboxSender(ctx, "gift");
  }
  if (needsLi && !liSender) throw new CommandError("LinkedIn sender required", 409);
  if (needsEmail && !emailSender) throw new CommandError("email sender required", 409);
  if (needsGift && !giftSender) throw new CommandError("gift sender required", 409);

  await ctx.db
    .update(tables.campaigns)
    .set({
      status: next,
      linkedinSenderId: liSender,
      emailSenderId: emailSender,
      giftSenderId: giftSender,
    })
    .where(eq(tables.campaigns.id, campaignId));

  const now = ctx.clock.now();
  const working = hoursOf(ws);
  for (const enrollment of campaign.enrollments) {
    if (enrollment.status !== "pending" && enrollment.status !== "waiting") continue;
    if (enrollment.status === "pending") {
      await ctx.db
        .update(tables.enrollments)
        .set({ status: transitionEnrollment("pending", "waiting"), updatedAt: iso(now) })
        .where(eq(tables.enrollments.id, enrollment.id));
    }
    await scheduleStep(ctx, {
      campaignId: asCampaignId(campaignId),
      enrollmentId: asEnrollmentId(enrollment.id),
      lead: enrollment.lead,
      steps: campaign.steps,
      stepIndex: enrollment.nextStepIndex,
      linkedinSenderId: liSender ? asSenderId(liSender) : null,
      emailSenderId: emailSender ? asSenderId(emailSender) : null,
      giftSenderId: giftSender ? asSenderId(giftSender) : null,
      sandbox: Boolean(ws.sandbox),
      working,
      from: now,
    });
  }
  await outbox(ctx, "campaign_started", { campaignId });
  await audit(ctx, "start_campaign", { campaignId });
  return getCampaign(ctx, campaignId);
}

function nextEnabledIndex(
  steps: Array<{ stepIndex: number; enabled?: number | boolean | null }>,
  after: number,
): number | null {
  const sorted = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
  for (const step of sorted) {
    if (step.stepIndex <= after) continue;
    if (step.enabled === 0 || step.enabled === false) continue;
    return step.stepIndex;
  }
  return null;
}

async function scheduleStep(
  ctx: AppContext,
  input: {
    campaignId: CampaignId;
    enrollmentId: EnrollmentId;
    lead: typeof tables.leads.$inferSelect | null;
    steps: { stepIndex: number; channel: string; action: string; delayHours: number; enabled?: number | boolean | null }[];
    stepIndex: number;
    linkedinSenderId: SenderId | null;
    emailSenderId: SenderId | null;
    giftSenderId: SenderId | null;
    sandbox: boolean;
    working: WorkingHours;
    from: Date;
  },
) {
  const step = input.steps.find((s) => s.stepIndex === input.stepIndex);
  if (!step) return;
  if (step.enabled === 0 || step.enabled === false) {
    const next = nextEnabledIndex(input.steps, input.stepIndex);
    if (next == null) return;
    return scheduleStep(ctx, { ...input, stepIndex: next });
  }
  const senderId =
    step.action === "gift" || step.channel === "gift"
      ? input.giftSenderId
      : step.channel === "email"
        ? input.emailSenderId
        : input.linkedinSenderId;
  if (!senderId) return;
  const jobId = newId("job");
  const skipNow = Boolean(missingChannelReason(step, input.lead));
  const due = nextWorkingSlot(
    addJitter(
      skipNow ? input.from : new Date(input.from.getTime() + step.delayHours * 3600 * 1000),
      jobId,
    ),
    input.working,
  );
  const key = `${input.enrollmentId}:${step.stepIndex}`;
  const existing = await ctx.db
    .select()
    .from(tables.sendJobs)
    .where(eq(tables.sendJobs.idempotencyKey, key))
    .limit(1);
  if (existing[0]) return;
  await ctx.db.insert(tables.sendJobs).values({
    id: jobId,
    enrollmentId: input.enrollmentId,
    senderId,
    campaignId: input.campaignId,
    stepIndex: step.stepIndex,
    status: "pending",
    dueAt: iso(due),
    claimedAt: null,
    claimedBy: null,
    idempotencyKey: key,
    dryRun: input.sandbox ? 1 : 0,
    providerId: null,
    error: null,
    createdAt: iso(ctx.clock.now()),
  });
}

export async function pauseCampaign(ctx: AppContext, campaignId: string) {
  const [campaign] = await ctx.db
    .select()
    .from(tables.campaigns)
    .where(eq(tables.campaigns.id, campaignId))
    .limit(1);
  if (!campaign) throw new CommandError("campaign not found", 404);
  const status = transitionCampaign(campaign.status as CampaignStatus, "paused");
  await ctx.db.update(tables.campaigns).set({ status }).where(eq(tables.campaigns.id, campaignId));
  await audit(ctx, "pause_campaign", { campaignId });
  return getCampaign(ctx, campaignId);
}

export async function resumeCampaign(ctx: AppContext, campaignId: string) {
  return startCampaign(ctx, campaignId);
}

export async function connectAccount(ctx: AppContext, channel: "linkedin" | "email") {
  const ws = await getWorkspace(ctx);
  const url = await ctx.unipile.hostedAuthUrl(channel);
  const id = await ensureSandboxSender(ctx, channel);
  const live = keysPresent();
  if (!live) {
    await ctx.db
      .update(tables.senderAccounts)
      .set({
        status: "healthy",
        unipileAccountId: `mock_${channel}`,
        displayName: channel === "linkedin" ? "Sandbox LinkedIn" : "Sandbox mailbox",
      })
      .where(eq(tables.senderAccounts.id, id));
  } else {
    const [row] = await ctx.db
      .select()
      .from(tables.senderAccounts)
      .where(eq(tables.senderAccounts.id, id))
      .limit(1);
    const alreadyLive = Boolean(row?.unipileAccountId && !row.unipileAccountId.startsWith("mock_"));
    if (!alreadyLive) {
      await ctx.db
        .update(tables.senderAccounts)
        .set({
          status: "pending",
          unipileAccountId: null,
          displayName: channel === "linkedin" ? "Connecting LinkedIn…" : "Connecting mailbox…",
        })
        .where(eq(tables.senderAccounts.id, id));
    }
  }
  await audit(ctx, "connect_account", { channel, senderId: id });
  return { senderId: id, authUrl: url, sandbox: Boolean(ws.sandbox), live };
}

export async function syncUnipileAccounts(ctx: AppContext) {
  const accounts = ctx.unipile.listAccounts ? await ctx.unipile.listAccounts() : [];
  const now = iso(ctx.clock.now());
  const mapped = [];
  for (const account of accounts) {
    const channel = channelFromUnipileAccount(account);
    if (!channel) continue;
    const display =
      account.name ||
      account.connection_params?.mail ||
      account.connection_params?.im ||
      `${channel} ${account.id}`;
    const existing = await ctx.db
      .select()
      .from(tables.senderAccounts)
      .where(
        and(
          eq(tables.senderAccounts.workspaceId, ctx.workspaceId),
          eq(tables.senderAccounts.unipileAccountId, account.id),
        ),
      )
      .limit(1);
    if (existing[0]) {
      await ctx.db
        .update(tables.senderAccounts)
        .set({ status: "healthy", displayName: display, lastError: null })
        .where(eq(tables.senderAccounts.id, existing[0].id));
      mapped.push(existing[0].id);
      continue;
    }
    const pending = await ctx.db
      .select()
      .from(tables.senderAccounts)
      .where(
        and(
          eq(tables.senderAccounts.workspaceId, ctx.workspaceId),
          eq(tables.senderAccounts.channel, channel),
          eq(tables.senderAccounts.status, "pending"),
        ),
      )
      .limit(1);
    if (pending[0]) {
      await ctx.db
        .update(tables.senderAccounts)
        .set({
          status: "healthy",
          unipileAccountId: account.id,
          displayName: display,
        })
        .where(eq(tables.senderAccounts.id, pending[0].id));
      mapped.push(pending[0].id);
      continue;
    }
    const byChannel = await ctx.db
      .select()
      .from(tables.senderAccounts)
      .where(
        and(eq(tables.senderAccounts.workspaceId, ctx.workspaceId), eq(tables.senderAccounts.channel, channel)),
      )
      .limit(1);
    if (byChannel[0] && (!byChannel[0].unipileAccountId || byChannel[0].unipileAccountId.startsWith("mock_"))) {
      await ctx.db
        .update(tables.senderAccounts)
        .set({
          status: "healthy",
          unipileAccountId: account.id,
          displayName: display,
          lastError: null,
        })
        .where(eq(tables.senderAccounts.id, byChannel[0].id));
      mapped.push(byChannel[0].id);
      continue;
    }
    const id = newId("snd") as SenderId;
    await ctx.db.insert(tables.senderAccounts).values({
      id,
      workspaceId: ctx.workspaceId,
      channel,
      status: "healthy",
      unipileAccountId: account.id,
      displayName: display,
      timezone: "America/Los_Angeles",
      lastError: null,
      createdAt: now,
    });
    mapped.push(id);
  }
  await audit(ctx, "sync_unipile_accounts", { count: mapped.length });
  return { synced: mapped.length, senders: await connectStatus(ctx) };
}

export async function connectStatus(ctx: AppContext) {
  const senders = await ctx.db
    .select()
    .from(tables.senderAccounts)
    .where(eq(tables.senderAccounts.workspaceId, ctx.workspaceId));
  const ws = await getWorkspace(ctx);
  return { sandbox: Boolean(ws.sandbox), killSwitch: Boolean(ws.killSwitch), senders };
}

export async function getInbox(ctx: AppContext) {
  const msgs = await ctx.db.select().from(tables.messages);
  const enrollIds = [...new Set(msgs.map((m) => m.enrollmentId))];
  const enrollments =
    enrollIds.length === 0
      ? []
      : await ctx.db.select().from(tables.enrollments).where(inArray(tables.enrollments.id, enrollIds));
  const leadIds = enrollments.map((e) => e.leadId);
  const leadRows =
    leadIds.length === 0 ? [] : await ctx.db.select().from(tables.leads).where(inArray(tables.leads.id, leadIds));
  const leadByEnroll = new Map(
    enrollments.map((e) => [e.id, leadRows.find((l) => l.id === e.leadId) ?? null]),
  );
  return msgs
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((m) => {
      const enrollment = enrollments.find((e) => e.id === m.enrollmentId) ?? null;
      return {
        ...m,
        enrollmentStatus: enrollment?.status ?? null,
        lead: leadByEnroll.get(m.enrollmentId) ?? null,
      };
    });
}

export async function stopLead(ctx: AppContext, enrollmentId: string) {
  const [enrollment] = await ctx.db
    .select()
    .from(tables.enrollments)
    .where(eq(tables.enrollments.id, enrollmentId))
    .limit(1);
  if (!enrollment) throw new CommandError("enrollment not found", 404);
  if (!isTerminalEnrollment(enrollment.status as EnrollmentStatus)) {
    const status = transitionEnrollment(enrollment.status as EnrollmentStatus, "stopped");
    await ctx.db
      .update(tables.enrollments)
      .set({ status, updatedAt: iso(ctx.clock.now()) })
      .where(eq(tables.enrollments.id, enrollmentId));
  }
  await cancelOpenJobs(ctx, enrollmentId);
  await audit(ctx, "stop_lead", { enrollmentId });
  return { ok: true };
}

export async function replyToLead(
  ctx: AppContext,
  input: { enrollmentId: string; body: string; channel?: "linkedin" | "email" },
) {
  const ws = await getWorkspace(ctx);
  if (ws.killSwitch) throw new CommandError("kill switch is on", 409);
  const body = input.body.trim();
  if (!body) throw new CommandError("message required");
  const [enrollment] = await ctx.db
    .select()
    .from(tables.enrollments)
    .where(eq(tables.enrollments.id, input.enrollmentId))
    .limit(1);
  if (!enrollment) throw new CommandError("enrollment not found", 404);
  const [lead] = await ctx.db.select().from(tables.leads).where(eq(tables.leads.id, enrollment.leadId)).limit(1);
  if (!lead) throw new CommandError("lead not found", 404);
  const [campaign] = await ctx.db
    .select()
    .from(tables.campaigns)
    .where(eq(tables.campaigns.id, enrollment.campaignId))
    .limit(1);
  if (!campaign) throw new CommandError("campaign not found", 404);

  const thread = await ctx.db
    .select()
    .from(tables.messages)
    .where(eq(tables.messages.enrollmentId, enrollment.id));
  thread.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const lastInbound = thread.find((m) => m.direction === "inbound");
  const lastAny = thread[0];
  const channel: "linkedin" | "email" =
    input.channel ??
    (lastInbound?.channel === "email" || lastAny?.channel === "email" ? "email" : "linkedin");
  if (channel === "email" && !lead.email) throw new CommandError("no email on this lead");
  const profileUrl = lead.linkedinUrlNormalized ?? lead.linkedinUrl;
  if (channel === "linkedin" && !profileUrl) throw new CommandError("no linkedin url on this lead");

  const senderId = channel === "email" ? campaign.emailSenderId : campaign.linkedinSenderId;
  if (!senderId) throw new CommandError(`no ${channel} sender on this sequence`);
  const [sender] = await ctx.db
    .select()
    .from(tables.senderAccounts)
    .where(eq(tables.senderAccounts.id, senderId))
    .limit(1);
  const accountId = sender?.unipileAccountId ?? "mock";
  const lastOutbound = thread.find((m) => m.direction === "outbound" && m.channel === channel);
  let result;
  if (channel === "linkedin") {
    result = await ctx.unipile.message({ accountId, profileUrl: profileUrl!, body });
  } else {
    result = await ctx.unipile.sendEmail({
      accountId,
      to: lead.email ?? "",
      subject: lastOutbound?.subject ? `Re: ${lastOutbound.subject.replace(/^Re:\s*/i, "")}` : "Re: your note",
      body,
    });
  }
  await ctx.db.insert(tables.messages).values({
    id: newId("msg"),
    enrollmentId: enrollment.id,
    channel,
    direction: "outbound",
    body,
    subject: channel === "email" ? (lastOutbound?.subject ?? "Re: your note") : null,
    providerId: result.providerId,
    createdAt: iso(ctx.clock.now()),
  });
  await audit(ctx, "reply_to_lead", {
    enrollmentId: enrollment.id,
    channel,
    dryRun: result.dryRun,
  });
  return {
    ok: true,
    enrollmentId: enrollment.id,
    channel,
    dryRun: result.dryRun,
    providerId: result.providerId,
  };
}

async function cancelOpenJobs(ctx: AppContext, enrollmentId: string) {
  const jobs = await ctx.db
    .select()
    .from(tables.sendJobs)
    .where(eq(tables.sendJobs.enrollmentId, enrollmentId));
  for (const job of jobs) {
    if (job.status === "pending" || job.status === "claimed") {
      await ctx.db
        .update(tables.sendJobs)
        .set({ status: transitionJob(job.status as JobStatus, "cancelled") })
        .where(eq(tables.sendJobs.id, job.id));
    }
  }
}

export async function recordReply(
  ctx: AppContext,
  input: { enrollmentId?: string; leadId?: string; channel: "linkedin" | "email"; body: string },
) {
  let enrollment;
  if (input.enrollmentId) {
    [enrollment] = await ctx.db
      .select()
      .from(tables.enrollments)
      .where(eq(tables.enrollments.id, input.enrollmentId))
      .limit(1);
  } else if (input.leadId) {
    [enrollment] = await ctx.db
      .select()
      .from(tables.enrollments)
      .where(eq(tables.enrollments.leadId, input.leadId))
      .limit(1);
  }
  if (!enrollment) throw new CommandError("enrollment not found", 404);
  if (!isTerminalEnrollment(enrollment.status as EnrollmentStatus)) {
    await ctx.db
      .update(tables.enrollments)
      .set({
        status: transitionEnrollment(enrollment.status as EnrollmentStatus, "replied"),
        updatedAt: iso(ctx.clock.now()),
      })
      .where(eq(tables.enrollments.id, enrollment.id));
  }
  await ctx.db.insert(tables.messages).values({
    id: newId("msg"),
    enrollmentId: enrollment.id,
    channel: input.channel,
    direction: "inbound",
    body: input.body,
    subject: null,
    providerId: null,
    createdAt: iso(ctx.clock.now()),
  });
  await cancelOpenJobs(ctx, enrollment.id);
  await audit(ctx, "record_reply", { enrollmentId: enrollment.id, channel: input.channel });
  return { ok: true, enrollmentId: enrollment.id };
}

export async function recordBounce(ctx: AppContext, enrollmentId: string) {
  const [enrollment] = await ctx.db
    .select()
    .from(tables.enrollments)
    .where(eq(tables.enrollments.id, enrollmentId))
    .limit(1);
  if (!enrollment) throw new CommandError("enrollment not found", 404);
  if (!isTerminalEnrollment(enrollment.status as EnrollmentStatus)) {
    await ctx.db
      .update(tables.enrollments)
      .set({
        status: transitionEnrollment(enrollment.status as EnrollmentStatus, "bounced"),
        updatedAt: iso(ctx.clock.now()),
      })
      .where(eq(tables.enrollments.id, enrollmentId));
  }
  await cancelOpenJobs(ctx, enrollmentId);
  await audit(ctx, "record_bounce", { enrollmentId });
}

export async function recordRestriction(ctx: AppContext, senderId: string) {
  const [sender] = await ctx.db
    .select()
    .from(tables.senderAccounts)
    .where(eq(tables.senderAccounts.id, senderId))
    .limit(1);
  if (!sender) throw new CommandError("sender not found", 404);
  await ctx.db
    .update(tables.senderAccounts)
    .set({
      status: transitionSender(sender.status as SenderStatus, "restricted"),
      lastError: "provider_restriction",
    })
    .where(eq(tables.senderAccounts.id, senderId));
  const campaigns = await ctx.db
    .select()
    .from(tables.campaigns)
    .where(
      and(
        eq(tables.campaigns.workspaceId, ctx.workspaceId),
        or(eq(tables.campaigns.linkedinSenderId, senderId), eq(tables.campaigns.emailSenderId, senderId)),
      ),
    );
  for (const campaign of campaigns) {
    if (campaign.status === "running" || campaign.status === "paused") {
      await ctx.db
        .update(tables.campaigns)
        .set({ status: transitionCampaign(campaign.status as CampaignStatus, "restricted") })
        .where(eq(tables.campaigns.id, campaign.id));
    }
  }
  const jobs = await ctx.db.select().from(tables.sendJobs).where(eq(tables.sendJobs.senderId, senderId));
  for (const job of jobs) {
    if (job.status === "pending" || job.status === "claimed") {
      await ctx.db
        .update(tables.sendJobs)
        .set({ status: transitionJob(job.status as JobStatus, "cancelled") })
        .where(eq(tables.sendJobs.id, job.id));
    }
  }
  await audit(ctx, "sender_restricted", { senderId });
}

export async function handleUnipileWebhook(
  ctx: AppContext,
  event: { eventId: string; type: string; senderId?: string; enrollmentId?: string; body?: string },
) {
  const dup = await ctx.db
    .select()
    .from(tables.webhookEvents)
    .where(eq(tables.webhookEvents.eventId, event.eventId))
    .limit(1);
  if (dup[0]) return { ok: true, duplicate: true };
  await ctx.db.insert(tables.webhookEvents).values({
    eventId: event.eventId,
    createdAt: iso(ctx.clock.now()),
  });
  if (event.type === "restriction" && event.senderId) {
    await recordRestriction(ctx, event.senderId);
  } else if (event.type === "reply" && event.enrollmentId) {
    await recordReply(ctx, {
      enrollmentId: event.enrollmentId,
      channel: "linkedin",
      body: event.body ?? "",
    });
  } else if (event.type === "bounce" && event.enrollmentId) {
    await recordBounce(ctx, event.enrollmentId);
  }
  return { ok: true, duplicate: false };
}

export async function updateSettings(
  ctx: AppContext,
  input: {
    sandbox?: boolean;
    killSwitch?: boolean;
    timezone?: string;
    weekendsEnabled?: boolean;
  },
) {
  const ws = await getWorkspace(ctx);
  await ctx.db
    .update(tables.workspaces)
    .set({
      sandbox: input.sandbox === undefined ? ws.sandbox : input.sandbox ? 1 : 0,
      killSwitch: input.killSwitch === undefined ? ws.killSwitch : input.killSwitch ? 1 : 0,
      timezone: input.timezone ?? ws.timezone,
      weekendsEnabled: input.weekendsEnabled === undefined ? ws.weekendsEnabled : input.weekendsEnabled ? 1 : 0,
    })
    .where(eq(tables.workspaces.id, ctx.workspaceId));
  await audit(ctx, "update_settings", input);
  return getWorkspace(ctx);
}

export async function listAudit(ctx: AppContext) {
  return ctx.db.select().from(tables.auditLog).where(eq(tables.auditLog.workspaceId, ctx.workspaceId));
}

async function senderHasInFlight(ctx: AppContext, senderId: string): Promise<boolean> {
  const rows = await ctx.db
    .select()
    .from(tables.sendJobs)
    .where(
      and(
        eq(tables.sendJobs.senderId, senderId),
        inArray(tables.sendJobs.status, ["claimed", "in_progress"]),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function tick(ctx: AppContext, opts?: { ignoreWorkingHours?: boolean }): Promise<{ processed: number }> {
  const ws = await getWorkspace(ctx);
  const now = ctx.clock.now();
  if (ws.killSwitch) return { processed: 0 };

  const pendingOutbox = await ctx.db
    .select()
    .from(tables.outbox)
    .where(and(eq(tables.outbox.workspaceId, ctx.workspaceId), isNull(tables.outbox.processedAt)));
  for (const row of pendingOutbox) {
    await ctx.db.update(tables.outbox).set({ processedAt: iso(now) }).where(eq(tables.outbox.id, row.id));
  }

  const due = await ctx.db
    .select()
    .from(tables.sendJobs)
    .where(and(eq(tables.sendJobs.status, "pending"), lte(tables.sendJobs.dueAt, iso(now))));
  due.sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  let processed = 0;
  const claimedSenders = new Set<string>();
  const working = hoursOf(ws);
  if (!opts?.ignoreWorkingHours && !inWorkingHours(now, working)) {
    return { processed: 0 };
  }

  for (const job of due) {
    if (claimedSenders.has(job.senderId) || (await senderHasInFlight(ctx, job.senderId))) continue;
    const [sender] = await ctx.db
      .select()
      .from(tables.senderAccounts)
      .where(eq(tables.senderAccounts.id, job.senderId))
      .limit(1);
    if (!sender || sender.status !== "healthy") continue;
    const [campaign] = await ctx.db
      .select()
      .from(tables.campaigns)
      .where(eq(tables.campaigns.id, job.campaignId))
      .limit(1);
    if (!campaign || campaign.status !== "running") continue;

    const claimed = transitionJob("pending", "claimed");
    await ctx.db
      .update(tables.sendJobs)
      .set({ status: claimed, claimedAt: iso(now), claimedBy: "worker" })
      .where(and(eq(tables.sendJobs.id, job.id), eq(tables.sendJobs.status, "pending")));
    claimedSenders.add(job.senderId);
    await executeJob(ctx, job.id);
    processed += 1;
  }
  return { processed };
}

async function executeJob(ctx: AppContext, jobId: string) {
  const [job] = await ctx.db.select().from(tables.sendJobs).where(eq(tables.sendJobs.id, jobId)).limit(1);
  if (!job) return;
  await ctx.db
    .update(tables.sendJobs)
    .set({ status: transitionJob(job.status as JobStatus, "in_progress") })
    .where(eq(tables.sendJobs.id, jobId));
  const [enrollment] = await ctx.db
    .select()
    .from(tables.enrollments)
    .where(eq(tables.enrollments.id, job.enrollmentId))
    .limit(1);
  if (!enrollment || isTerminalEnrollment(enrollment.status as EnrollmentStatus)) {
    await ctx.db
      .update(tables.sendJobs)
      .set({ status: transitionJob("in_progress", "cancelled") })
      .where(eq(tables.sendJobs.id, jobId));
    return;
  }
  await ctx.db
    .update(tables.enrollments)
    .set({
      status: enrollment.status === "waiting" ? transitionEnrollment("waiting", "in_progress") : enrollment.status,
      updatedAt: iso(ctx.clock.now()),
    })
    .where(eq(tables.enrollments.id, enrollment.id));

  const [lead] = await ctx.db.select().from(tables.leads).where(eq(tables.leads.id, enrollment.leadId)).limit(1);
  const steps = await ctx.db
    .select()
    .from(tables.sequenceSteps)
    .where(eq(tables.sequenceSteps.campaignId, job.campaignId));
  const step = steps.find((s) => s.stepIndex === job.stepIndex);
  if (!lead || !step) {
    await ctx.db
      .update(tables.sendJobs)
      .set({ status: transitionJob("in_progress", "failed"), error: "missing lead or step" })
      .where(eq(tables.sendJobs.id, jobId));
    return;
  }

  if (step.enabled === 0) {
    await finishJob(ctx, jobId, enrollment.id, steps, job, "skipped", "disabled");
    return;
  }

  if ((step.skipOverdueHours ?? 0) > 0) {
    const due = new Date(job.dueAt).getTime();
    if (ctx.clock.now().getTime() > due + step.skipOverdueHours * 3600 * 1000) {
      await finishJob(ctx, jobId, enrollment.id, steps, job, "skipped", "overdue");
      return;
    }
  }

  const missing = missingChannelReason(step, lead);
  if (missing) {
    await finishJob(ctx, jobId, enrollment.id, steps, job, "skipped", missing);
    return;
  }

  if (step.action === "message") {
    const priorConnect = steps.find((s) => s.action === "connection" && s.stepIndex < step.stepIndex);
    if (priorConnect) {
      const priorJob = await ctx.db
        .select()
        .from(tables.sendJobs)
        .where(eq(tables.sendJobs.idempotencyKey, `${enrollment.id}:${priorConnect.stepIndex}`))
        .limit(1);
      const priorStatus = priorJob[0]?.status;
      if (priorStatus === "skipped" || priorStatus === "failed" || priorStatus === "cancelled") {
        await finishJob(ctx, jobId, enrollment.id, steps, job, "skipped", "not connected");
        return;
      }
      if (!priorJob[0] || priorStatus !== "sent") {
        await ctx.db
          .update(tables.sendJobs)
          .set({
            status: transitionJob("in_progress", "pending"),
            dueAt: iso(new Date(ctx.clock.now().getTime() + 60 * 60 * 1000)),
            claimedAt: null,
            claimedBy: null,
          })
          .where(eq(tables.sendJobs.id, jobId));
        await ctx.db
          .update(tables.enrollments)
          .set({ status: transitionEnrollment("in_progress", "waiting"), updatedAt: iso(ctx.clock.now()) })
          .where(eq(tables.enrollments.id, enrollment.id));
        return;
      }
    }
  }

  const [sender] = await ctx.db
    .select()
    .from(tables.senderAccounts)
    .where(eq(tables.senderAccounts.id, job.senderId))
    .limit(1);
  const fields = leadFields(lead);
  const body = renderTemplate(step.bodyTemplate, fields);
  const subject = step.subjectTemplate ? renderTemplate(step.subjectTemplate, fields) : null;
  const accountId = sender?.unipileAccountId ?? "mock";
  let result;
  if (step.action === "connection") {
    if (!fields.linkedinUrl) {
      await finishJob(ctx, jobId, enrollment.id, steps, job, "skipped", "no linkedin url");
      return;
    }
    result = await ctx.unipile.invite({
      accountId,
      profileUrl: fields.linkedinUrl,
      body,
      imageUrl: step.imageUrl,
    });
  } else if (step.action === "message") {
    if (!fields.linkedinUrl) {
      await finishJob(ctx, jobId, enrollment.id, steps, job, "skipped", "no linkedin url");
      return;
    }
    result = await ctx.unipile.message({
      accountId,
      profileUrl: fields.linkedinUrl,
      body,
      imageUrl: step.imageUrl,
    });
  } else if (step.action === "gift" || step.channel === "gift") {
    const item = step.giftItem || subject || "cookies";
    const note = body || step.giftNote || "";
    const giftResult = await giftOf(ctx).send({
      item,
      note,
      name: lead.fullName,
      company: lead.company,
      address: giftAddressOf(lead),
    });
    result = { providerId: giftResult.providerId, dryRun: giftResult.dryRun };
    await outbox(ctx, "gift_queued", {
      jobId,
      vendor: giftResult.vendor,
      item,
      charged: giftResult.charged,
      dryRun: giftResult.dryRun,
    });
  } else {
    result = await ctx.unipile.sendEmail({
      accountId,
      to: lead.email ?? "",
      subject: subject ?? "",
      body,
    });
  }

  await ctx.db.insert(tables.messages).values({
    id: newId("msg"),
    enrollmentId: enrollment.id,
    channel: step.channel,
    direction: "outbound",
    body,
    subject,
    providerId: result.providerId,
    createdAt: iso(ctx.clock.now()),
  });
  await ctx.db
    .update(tables.sendJobs)
    .set({
      status: transitionJob("in_progress", "sent"),
      providerId: result.providerId,
      dryRun: result.dryRun ? 1 : job.dryRun,
    })
    .where(eq(tables.sendJobs.id, jobId));
  await outbox(ctx, "job_sent", { jobId, providerId: result.providerId });

  const nextIndex = nextEnabledIndex(steps, job.stepIndex);
  const hasNext = nextIndex != null;
  if (!hasNext) {
    await ctx.db
      .update(tables.enrollments)
      .set({
        status: transitionEnrollment("in_progress", "completed"),
        nextStepIndex: nextIndex ?? job.stepIndex + 1,
        updatedAt: iso(ctx.clock.now()),
      })
      .where(eq(tables.enrollments.id, enrollment.id));
    return;
  }
  const [campaign] = await ctx.db
    .select()
    .from(tables.campaigns)
    .where(eq(tables.campaigns.id, job.campaignId))
    .limit(1);
  const ws = await getWorkspace(ctx);
  await ctx.db
    .update(tables.enrollments)
    .set({
      status: transitionEnrollment("in_progress", "waiting"),
      nextStepIndex: nextIndex,
      updatedAt: iso(ctx.clock.now()),
    })
    .where(eq(tables.enrollments.id, enrollment.id));
  await scheduleStep(ctx, {
    campaignId: asCampaignId(job.campaignId),
    enrollmentId: asEnrollmentId(enrollment.id),
    lead,
    steps,
    stepIndex: nextIndex,
    linkedinSenderId: campaign?.linkedinSenderId ? asSenderId(campaign.linkedinSenderId) : null,
    emailSenderId: campaign?.emailSenderId ? asSenderId(campaign.emailSenderId) : null,
    giftSenderId: campaign?.giftSenderId ? asSenderId(campaign.giftSenderId) : null,
    sandbox: Boolean(ws.sandbox),
    working: hoursOf(ws),
    from: ctx.clock.now(),
  });
}

async function finishJob(
  ctx: AppContext,
  jobId: string,
  enrollmentId: string,
  steps: { stepIndex: number; channel: string; action: string; delayHours: number; enabled?: number | boolean | null }[],
  job: { stepIndex: number; campaignId: string; senderId: string },
  status: "skipped" | "failed",
  error: string,
) {
  await ctx.db
    .update(tables.sendJobs)
    .set({ status: transitionJob("in_progress", status), error })
    .where(eq(tables.sendJobs.id, jobId));
  const nextIndex = nextEnabledIndex(steps, job.stepIndex);
  const hasNext = nextIndex != null;
  await ctx.db
    .update(tables.enrollments)
    .set({
      status: hasNext ? transitionEnrollment("in_progress", "waiting") : transitionEnrollment("in_progress", "completed"),
      nextStepIndex: nextIndex ?? job.stepIndex + 1,
      updatedAt: iso(ctx.clock.now()),
    })
    .where(eq(tables.enrollments.id, enrollmentId));
  if (hasNext) {
    const [campaign] = await ctx.db
      .select()
      .from(tables.campaigns)
      .where(eq(tables.campaigns.id, job.campaignId))
      .limit(1);
    const ws = await getWorkspace(ctx);
    const [lead] = await ctx.db
      .select()
      .from(tables.leads)
      .where(
        eq(
          tables.leads.id,
          (
            await ctx.db
              .select()
              .from(tables.enrollments)
              .where(eq(tables.enrollments.id, enrollmentId))
              .limit(1)
          )[0]?.leadId ?? "",
        ),
      )
      .limit(1);
    await scheduleStep(ctx, {
      campaignId: asCampaignId(job.campaignId),
      enrollmentId: asEnrollmentId(enrollmentId),
      lead: lead ?? null,
      steps,
      stepIndex: nextIndex,
      linkedinSenderId: campaign?.linkedinSenderId ? asSenderId(campaign.linkedinSenderId) : null,
      emailSenderId: campaign?.emailSenderId ? asSenderId(campaign.emailSenderId) : null,
      giftSenderId: campaign?.giftSenderId ? asSenderId(campaign.giftSenderId) : null,
      sandbox: Boolean(ws.sandbox),
      working: hoursOf(ws),
      from: ctx.clock.now(),
    });
  }
}

function dataOf(ctx: AppContext): DataPort {
  return ctx.data ?? new StubData(ctx.unipile);
}

function giftOf(ctx: AppContext): GiftPort {
  return ctx.gift ?? new MockGift();
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function hitsToCsv(hits: LeadSearchHit[]): string {
  const header =
    "first_name,last_name,company,title,email,linkedin_url,opening_line,public_url,custom_source";
  const rows = hits.map((h) =>
    [
      h.firstName,
      h.lastName,
      h.company,
      h.title,
      h.email ?? "",
      h.linkedinUrl ?? "",
      h.openingLine,
      h.publicUrl ?? "",
      h.source ?? "unknown",
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

export async function searchPeople(
  ctx: AppContext,
  input: { brief: string; limit?: number; people?: LeadSearchHit[]; listName?: string },
) {
  const limit = input.limit ?? 10;
  const hits = await dataOf(ctx).searchPeople({
    brief: input.brief,
    limit,
    people: input.people,
  });
  if (hits.length === 0) {
    return {
      listId: null as string | null,
      name: input.listName ?? input.brief.slice(0, 80),
      counts: { imported: 0, merged: 0, skipped: 0, invalid: 0 },
      people: [] as LeadSearchHit[],
      source: "none",
      sources: [] as string[],
    };
  }
  const imported = await importLeads(ctx, {
    listName: input.listName ?? input.brief.slice(0, 80),
    content: hitsToCsv(hits),
    format: "csv",
  });
  const sources = [...new Set(hits.map((h) => h.source ?? "unknown"))];
  await audit(ctx, "search_people", { listId: imported.listId, brief: input.brief, count: hits.length, sources });
  return { ...imported, people: hits, source: sources[0] ?? "none", sources };
}

export async function researchLeads(ctx: AppContext, listId: string) {
  const list = await getList(ctx, listId);
  const port = dataOf(ctx);
  const updated = [];
  for (const lead of list.leads) {
    const researched = await port.researchLead(hitToResearchInput(lead));
    await ctx.db
      .update(tables.leads)
      .set({
        openingLine: researched.openingLine,
        publicUrl: researched.publicUrl,
      })
      .where(eq(tables.leads.id, lead.id));
    updated.push({
      id: lead.id,
      fullName: lead.fullName,
      openingLine: researched.openingLine,
      publicUrl: researched.publicUrl,
      notes: researched.notes,
    });
  }
  await audit(ctx, "research_leads", { listId, count: updated.length });
  return { listId, researched: updated.length, leads: updated };
}

export async function qualifyLeads(ctx: AppContext, listId: string, criteria: string) {
  const list = await getList(ctx, listId);
  const rows = [];
  for (const lead of list.leads) {
    const blob = [
      lead.fullName,
      lead.title,
      lead.company,
      lead.openingLine,
      lead.email,
      lead.linkedinUrl,
      lead.publicUrl,
    ].join(" ");
    const result = qualifyLead(blob, criteria);
    const custom = JSON.parse(lead.customJson || "{}") as Record<string, unknown>;
    custom.qualification = {
      decision: result.decision,
      explanation: result.explanation,
      criteria,
      score: result.score,
      reason: result.reason,
      at: iso(ctx.clock.now()),
    };
    custom.score = result.score;
    await ctx.db
      .update(tables.leads)
      .set({ customJson: JSON.stringify(custom) })
      .where(eq(tables.leads.id, lead.id));
    rows.push({
      id: lead.id,
      fullName: lead.fullName,
      decision: result.decision,
      explanation: result.explanation,
      score: result.score,
      reason: result.reason,
    });
  }
  await audit(ctx, "qualify_leads", { listId, criteria, count: rows.length });
  return { listId, criteria, leads: rows };
}

export async function promptToCampaign(
  ctx: AppContext,
  input: {
    brief: string;
    limit?: number;
    name?: string;
    templateKey?: TemplateKey;
    people?: LeadSearchHit[];
  },
) {
  const searched = await searchPeople(ctx, {
    brief: input.brief,
    limit: input.limit ?? 10,
    people: input.people,
    listName: input.name ?? input.brief.slice(0, 80),
  });
  if (!searched.listId) {
    throw new CommandError("no people found for that brief — add APOLLO_API_KEY or pass people", 404);
  }
  await researchLeads(ctx, searched.listId);
  const created = await createCampaign(ctx, {
    name: input.name ?? input.brief.slice(0, 80),
    templateKey: input.templateKey ?? "linkedin_only",
  });
  await addLeadsToCampaign(ctx, created.id, { listId: searched.listId });
  const campaign = await getCampaign(ctx, created.id);
  await audit(ctx, "prompt_to_campaign", { campaignId: created.id, listId: searched.listId });
  return { ...campaign, listId: searched.listId };
}

export type CrmContact = {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  linkedinUrl: string | null;
  company: string;
  title: string;
  source: string;
  score: number | null;
  decision: string | null;
  reason: string | null;
};

export async function exportLeadsToCrm(ctx: AppContext, listId: string) {
  const list = await getList(ctx, listId);
  const contacts: CrmContact[] = list.leads.map((lead) => {
    const custom = leadCustom(lead);
    const qualification = (custom.qualification ?? {}) as {
      decision?: string;
      reason?: string;
      explanation?: string;
      score?: number;
    };
    const score =
      typeof custom.score === "number"
        ? custom.score
        : typeof qualification.score === "number"
          ? qualification.score
          : null;
    return {
      firstName: lead.firstName,
      lastName: lead.lastName,
      fullName: lead.fullName,
      email: lead.email,
      linkedinUrl: lead.linkedinUrlNormalized ?? lead.linkedinUrl,
      company: lead.company,
      title: lead.title,
      source: typeof custom.custom_source === "string" ? custom.custom_source : "import",
      score,
      decision: qualification.decision ?? null,
      reason: qualification.reason ?? qualification.explanation ?? null,
    };
  });
  const payload = {
    destination: process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_API_KEY ? "hubspot" : "payload",
    sent: false,
    charged: false,
    listId,
    listName: list.name,
    contacts,
  };
  await outbox(ctx, "crm_export", payload);
  await audit(ctx, "export_leads", { listId, count: contacts.length, destination: payload.destination });
  return payload;
}

export async function listSignals(ctx: AppContext, input?: { sinceDays?: number }) {
  const days = input?.sinceDays ?? 7;
  const since = new Date(ctx.clock.now().getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await ctx.db
    .select()
    .from(tables.signals)
    .where(eq(tables.signals.workspaceId, ctx.workspaceId));
  return rows.filter((row) => row.occurredAt >= since).sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
}

export async function ingestSignals(
  ctx: AppContext,
  input?: {
    signals?: Array<{
      type: SignalType;
      title: string;
      detail?: string;
      company?: string;
      personName?: string;
      source?: string;
      occurredAt?: string;
      leadId?: string;
    }>;
  },
) {
  const now = iso(ctx.clock.now());
  const drafts =
    input?.signals?.length
      ? input.signals.map((s) => ({
          type: s.type,
          title: s.title,
          detail: s.detail ?? "",
          company: s.company ?? "",
          personName: s.personName ?? "",
          source: s.source ?? "provided",
          occurredAt: s.occurredAt ?? now,
          leadId: s.leadId ?? null,
        }))
      : demoSignalsFromCatalog(ctx.clock.now()).map((s) => ({ ...s, leadId: null as string | null }));
  const existing = await ctx.db
    .select()
    .from(tables.signals)
    .where(eq(tables.signals.workspaceId, ctx.workspaceId));
  let created = 0;
  for (const draft of drafts) {
    const dup = existing.find(
      (row) =>
        row.signalType === draft.type &&
        row.company === draft.company &&
        row.personName === draft.personName &&
        row.occurredAt.slice(0, 10) === draft.occurredAt.slice(0, 10),
    );
    if (dup) continue;
    const row = {
      id: newId("sig"),
      workspaceId: ctx.workspaceId,
      leadId: draft.leadId,
      signalType: draft.type,
      title: draft.title,
      detail: draft.detail,
      company: draft.company,
      personName: draft.personName,
      source: draft.source,
      occurredAt: draft.occurredAt,
      createdAt: now,
    };
    await ctx.db.insert(tables.signals).values(row);
    existing.push(row);
    created += 1;
  }
  await audit(ctx, "ingest_signals", { created, total: existing.length });
  return { created, signals: await listSignals(ctx) };
}

export type LearningSuggestion = {
  kind: "double_down" | "not_enough_data";
  stepIndex: number | null;
  snippet: string;
  replyRate: number;
  sent: number;
  replies: number;
  suggestedBody: string | null;
};

export async function suggestLearnings(ctx: AppContext, campaignId: string) {
  const campaign = await getCampaign(ctx, campaignId);
  const jobs = campaign.jobs ?? [];
  const enrollById = new Map(campaign.enrollments.map((e) => [e.id, e]));
  const sentByStep = new Map<number, number>();
  const repliesByStep = new Map<number, number>();
  for (const job of jobs) {
    if (job.status !== "sent") continue;
    sentByStep.set(job.stepIndex, (sentByStep.get(job.stepIndex) ?? 0) + 1);
    const enrollment = enrollById.get(job.enrollmentId);
    if (enrollment?.status === "replied") {
      repliesByStep.set(job.stepIndex, (repliesByStep.get(job.stepIndex) ?? 0) + 1);
    }
  }
  const suggestions: LearningSuggestion[] = [];
  if ([...sentByStep.values()].reduce((a, b) => a + b, 0) === 0) {
    suggestions.push({
      kind: "not_enough_data",
      stepIndex: null,
      snippet: "",
      replyRate: 0,
      sent: 0,
      replies: 0,
      suggestedBody: null,
    });
  } else {
    let best: { stepIndex: number; rate: number; sent: number; replies: number; body: string } | null = null;
    for (const step of campaign.steps) {
      const sent = sentByStep.get(step.stepIndex) ?? 0;
      if (sent === 0) continue;
      const replies = repliesByStep.get(step.stepIndex) ?? 0;
      const rate = replies / sent;
      if (!best || rate > best.rate) {
        best = { stepIndex: step.stepIndex, rate, sent, replies, body: step.bodyTemplate };
      }
    }
    if (best) {
      suggestions.push({
        kind: "double_down",
        stepIndex: best.stepIndex,
        snippet: best.body.slice(0, 80),
        replyRate: best.rate,
        sent: best.sent,
        replies: best.replies,
        suggestedBody: best.body,
      });
    }
  }
  await audit(ctx, "suggest_learnings", { campaignId, count: suggestions.length });
  return {
    campaignId,
    status: campaign.status,
    started: false,
    suggestions,
  };
}

export async function applyLearnings(ctx: AppContext, campaignId: string) {
  const source = await getCampaign(ctx, campaignId);
  const learnings = await suggestLearnings(ctx, campaignId);
  const winner = learnings.suggestions.find((s) => s.kind === "double_down" && s.suggestedBody);
  const steps = source.steps.map((step) => ({
    stepIndex: step.stepIndex,
    channel: step.channel as SequenceStepDraft["channel"],
    action: step.action as SequenceStepDraft["action"],
    delayHours: step.delayHours,
    bodyTemplate:
      winner && step.stepIndex !== winner.stepIndex && step.action !== "gift"
        ? winner.suggestedBody ?? step.bodyTemplate
        : step.bodyTemplate,
    subjectTemplate: step.subjectTemplate,
    enabled: step.enabled !== 0,
    skipOverdueHours: step.skipOverdueHours,
    imageUrl: step.imageUrl,
    giftItem: step.giftItem,
    giftNote: step.giftNote,
  }));
  const created = await createCampaign(ctx, {
    name: `${source.name} · learnings`,
    templateKey: (source.templateKey as TemplateKey | null) ?? undefined,
    steps,
  });
  await audit(ctx, "apply_learnings", { sourceId: campaignId, draftId: created.id, status: "draft" });
  return { ...created, status: "draft" as const, sourceId: campaignId, started: false, suggestions: learnings.suggestions };
}

export function dataSourceNames(ctx: AppContext): string[] {
  const port = dataOf(ctx);
  return port instanceof WaterfallData ? port.sourceNames() : ["stub_catalog"];
}

export { SIGNAL_TYPES };

export function defaultClock(): Clock {
  return { now: () => new Date() };
}

export { DEFAULT_WORKSPACE_ID };
