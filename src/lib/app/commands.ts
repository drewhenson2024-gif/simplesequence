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
import type { UnipilePort } from "../unipile/port";

export type Clock = { now: () => Date };

export type AppContext = {
  db: Db;
  client: Client;
  unipile: UnipilePort;
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
      });
    }
  }
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
  return {
    ...campaign,
    steps,
    enrollments: enrollments.map((e) => ({ ...e, lead: byId.get(e.leadId) ?? null })),
    enrollmentCounts: counts,
    jobCounts,
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

async function ensureSandboxSender(ctx: AppContext, channel: "linkedin" | "email"): Promise<SenderId> {
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
    displayName: channel === "linkedin" ? "Sandbox LinkedIn" : "Sandbox mailbox",
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
  let liSender = campaign.linkedinSenderId;
  let emailSender = campaign.emailSenderId;
  if (ws.sandbox) {
    if (needsLi && !liSender) liSender = await ensureSandboxSender(ctx, "linkedin");
    if (needsEmail && !emailSender) emailSender = await ensureSandboxSender(ctx, "email");
  }
  if (needsLi && !liSender) throw new CommandError("LinkedIn sender required", 409);
  if (needsEmail && !emailSender) throw new CommandError("email sender required", 409);

  await ctx.db
    .update(tables.campaigns)
    .set({
      status: next,
      linkedinSenderId: liSender,
      emailSenderId: emailSender,
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
      sandbox: Boolean(ws.sandbox),
      working,
      from: now,
    });
  }
  await outbox(ctx, "campaign_started", { campaignId });
  await audit(ctx, "start_campaign", { campaignId });
  return getCampaign(ctx, campaignId);
}

async function scheduleStep(
  ctx: AppContext,
  input: {
    campaignId: CampaignId;
    enrollmentId: EnrollmentId;
    lead: typeof tables.leads.$inferSelect | null;
    steps: { stepIndex: number; channel: string; action: string; delayHours: number }[];
    stepIndex: number;
    linkedinSenderId: SenderId | null;
    emailSenderId: SenderId | null;
    sandbox: boolean;
    working: WorkingHours;
    from: Date;
  },
) {
  const step = input.steps.find((s) => s.stepIndex === input.stepIndex);
  if (!step) return;
  const senderId = step.channel === "email" ? input.emailSenderId : input.linkedinSenderId;
  if (!senderId) return;
  const jobId = newId("job");
  const due = nextWorkingSlot(
    addJitter(new Date(input.from.getTime() + step.delayHours * 3600 * 1000), jobId),
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
  if (ws.sandbox) {
    await ctx.db
      .update(tables.senderAccounts)
      .set({ status: "healthy", unipileAccountId: `mock_${channel}` })
      .where(eq(tables.senderAccounts.id, id));
  }
  await audit(ctx, "connect_account", { channel, senderId: id });
  return { senderId: id, authUrl: url, sandbox: Boolean(ws.sandbox) };
}

export async function connectStatus(ctx: AppContext) {
  const senders = await ctx.db
    .select()
    .from(tables.senderAccounts)
    .where(eq(tables.senderAccounts.workspaceId, ctx.workspaceId));
  const ws = await getWorkspace(ctx);
  return { sandbox: Boolean(ws.sandbox), protectMode: Boolean(ws.protectMode), killSwitch: Boolean(ws.killSwitch), senders };
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
    .map((m) => ({ ...m, lead: leadByEnroll.get(m.enrollmentId) ?? null }));
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
    protectMode?: boolean;
    protectDailyMax?: number | null;
    sandbox?: boolean;
    killSwitch?: boolean;
    timezone?: string;
    weekendsEnabled?: boolean;
  },
) {
  if (input.protectMode && (input.protectDailyMax == null || input.protectDailyMax <= 0)) {
    throw new CommandError("protect mode requires a daily max you type yourself");
  }
  const ws = await getWorkspace(ctx);
  await ctx.db
    .update(tables.workspaces)
    .set({
      protectMode: input.protectMode === undefined ? ws.protectMode : input.protectMode ? 1 : 0,
      protectDailyMax: input.protectDailyMax === undefined ? ws.protectDailyMax : input.protectDailyMax,
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

async function sentToday(ctx: AppContext, senderId: string, startIso: string): Promise<number> {
  const rows = await ctx.db
    .select()
    .from(tables.sendJobs)
    .where(and(eq(tables.sendJobs.senderId, senderId), eq(tables.sendJobs.status, "sent")));
  return rows.filter((r) => (r.claimedAt ?? r.createdAt) >= startIso).length;
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

  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);

  for (const job of due) {
    if (claimedSenders.has(job.senderId) || (await senderHasInFlight(ctx, job.senderId))) continue;
    const [sender] = await ctx.db
      .select()
      .from(tables.senderAccounts)
      .where(eq(tables.senderAccounts.id, job.senderId))
      .limit(1);
    if (!sender || sender.status !== "healthy") continue;
    if (ws.protectMode && ws.protectDailyMax != null) {
      const n = await sentToday(ctx, job.senderId, iso(dayStart));
      if (n >= ws.protectDailyMax) continue;
    }
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

  if (step.action === "email" && !lead.email) {
    await finishJob(ctx, jobId, enrollment.id, steps, job, "skipped", "no email");
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
      if (!priorJob[0] || priorJob[0].status !== "sent") {
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
    result = await ctx.unipile.invite({ accountId, profileUrl: fields.linkedinUrl, body });
  } else if (step.action === "message") {
    if (!fields.linkedinUrl) {
      await finishJob(ctx, jobId, enrollment.id, steps, job, "skipped", "no linkedin url");
      return;
    }
    result = await ctx.unipile.message({ accountId, profileUrl: fields.linkedinUrl, body });
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

  const nextIndex = job.stepIndex + 1;
  const hasNext = steps.some((s) => s.stepIndex === nextIndex);
  if (!hasNext) {
    await ctx.db
      .update(tables.enrollments)
      .set({
        status: transitionEnrollment("in_progress", "completed"),
        nextStepIndex: nextIndex,
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
    sandbox: Boolean(ws.sandbox),
    working: hoursOf(ws),
    from: ctx.clock.now(),
  });
}

async function finishJob(
  ctx: AppContext,
  jobId: string,
  enrollmentId: string,
  steps: { stepIndex: number }[],
  job: { stepIndex: number; campaignId: string; senderId: string },
  status: "skipped" | "failed",
  error: string,
) {
  await ctx.db
    .update(tables.sendJobs)
    .set({ status: transitionJob("in_progress", status), error })
    .where(eq(tables.sendJobs.id, jobId));
  const nextIndex = job.stepIndex + 1;
  const hasNext = steps.some((s) => s.stepIndex === nextIndex);
  await ctx.db
    .update(tables.enrollments)
    .set({
      status: hasNext ? transitionEnrollment("in_progress", "waiting") : transitionEnrollment("in_progress", "completed"),
      nextStepIndex: nextIndex,
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
      sandbox: Boolean(ws.sandbox),
      working: hoursOf(ws),
      from: ctx.clock.now(),
    });
  }
}

export function defaultClock(): Clock {
  return { now: () => new Date() };
}

export { DEFAULT_WORKSPACE_ID };
