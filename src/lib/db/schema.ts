import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  workingStartHour: integer("working_start_hour").notNull().default(8),
  workingEndHour: integer("working_end_hour").notNull().default(18),
  weekendsEnabled: integer("weekends_enabled").notNull().default(0),
  protectMode: integer("protect_mode").notNull().default(0),
  protectDailyMax: integer("protect_daily_max"),
  sandbox: integer("sandbox").notNull().default(1),
  killSwitch: integer("kill_switch").notNull().default(0),
  developerTrial: integer("developer_trial").notNull().default(0),
  linkedinSenderId: text("linkedin_sender_id"),
  mcpApiKey: text("mcp_api_key").notNull().default("dev-mcp-key"),
  createdAt: text("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
});

export const senderAccounts = sqliteTable("sender_accounts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  channel: text("channel").notNull(),
  status: text("status").notNull(),
  unipileAccountId: text("unipile_account_id"),
  displayName: text("display_name").notNull(),
  profileUrl: text("profile_url"),
  timezone: text("timezone"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
});

export const lists = sqliteTable("lists", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  rawImport: text("raw_import"),
  createdAt: text("created_at").notNull(),
});

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  fullName: text("full_name").notNull().default(""),
  company: text("company").notNull().default(""),
  title: text("title").notNull().default(""),
  headline: text("headline").notNull().default(""),
  location: text("location").notNull().default(""),
  about: text("about").notNull().default(""),
  email: text("email"),
  linkedinUrl: text("linkedin_url"),
  linkedinUrlNormalized: text("linkedin_url_normalized"),
  openingLine: text("opening_line").notNull().default(""),
  publicUrl: text("public_url"),
  customJson: text("custom_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
});

export const listLeads = sqliteTable(
  "list_leads",
  {
    listId: text("list_id").notNull(),
    leadId: text("lead_id").notNull(),
  },
  (t) => [uniqueIndex("list_leads_pk").on(t.listId, t.leadId)],
);

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  templateKey: text("template_key"),
  linkedinSenderId: text("linkedin_sender_id"),
  createdAt: text("created_at").notNull(),
});

export const sequenceSteps = sqliteTable("sequence_steps", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  stepIndex: integer("step_index").notNull(),
  channel: text("channel").notNull(),
  action: text("action").notNull(),
  delayHours: integer("delay_hours").notNull().default(0),
  bodyTemplate: text("body_template").notNull().default(""),
  subjectTemplate: text("subject_template"),
  enabled: integer("enabled").notNull().default(1),
  skipOverdueHours: integer("skip_overdue_hours").notNull().default(72),
  imageUrl: text("image_url"),
});

export const enrollments = sqliteTable("enrollments", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  leadId: text("lead_id").notNull(),
  status: text("status").notNull(),
  nextStepIndex: integer("next_step_index").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sendJobs = sqliteTable(
  "send_jobs",
  {
    id: text("id").primaryKey(),
    enrollmentId: text("enrollment_id").notNull(),
    senderId: text("sender_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    stepIndex: integer("step_index").notNull(),
    status: text("status").notNull(),
    dueAt: text("due_at").notNull(),
    claimedAt: text("claimed_at"),
    claimedBy: text("claimed_by"),
    idempotencyKey: text("idempotency_key").notNull(),
    dryRun: integer("dry_run").notNull().default(1),
    providerId: text("provider_id"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("send_jobs_idem").on(t.idempotencyKey)],
);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  enrollmentId: text("enrollment_id").notNull(),
  channel: text("channel").notNull(),
  direction: text("direction").notNull(),
  body: text("body").notNull().default(""),
  subject: text("subject"),
  providerId: text("provider_id"),
  createdAt: text("created_at").notNull(),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
});

export const outbox = sqliteTable("outbox", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  topic: text("topic").notNull(),
  payloadJson: text("payload_json").notNull(),
  processedAt: text("processed_at"),
  createdAt: text("created_at").notNull(),
});

export const idempotencyKeys = sqliteTable("idempotency_keys", {
  key: text("key").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  resultJson: text("result_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const webhookEvents = sqliteTable("webhook_events", {
  eventId: text("event_id").primaryKey(),
  createdAt: text("created_at").notNull(),
});

export const trialRuns = sqliteTable("trial_runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  status: text("status").notNull(),
  action: text("action").notNull(),
  intervalSeconds: integer("interval_seconds").notNull(),
  body: text("body").notNull().default(""),
  urlsJson: text("urls_json").notNull(),
  nextIndex: integer("next_index").notNull().default(0),
  senderId: text("sender_id"),
  dryRun: integer("dry_run").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  endReason: text("end_reason"),
});

export const trialEvents = sqliteTable("trial_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  url: text("url").notNull(),
  at: text("at").notNull(),
  sent: integer("sent").notNull().default(0),
  restricted: integer("restricted").notNull().default(0),
  throttled: integer("throttled").notNull().default(0),
  quota: integer("quota").notNull().default(0),
  dryRun: integer("dry_run").notNull().default(0),
  error: text("error"),
});

export const signals = sqliteTable("signals", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  leadId: text("lead_id"),
  signalType: text("signal_type").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  company: text("company").notNull().default(""),
  personName: text("person_name").notNull().default(""),
  source: text("source").notNull().default("stub_catalog"),
  occurredAt: text("occurred_at").notNull(),
  createdAt: text("created_at").notNull(),
});
