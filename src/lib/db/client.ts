import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { DEFAULT_USER_ID, DEFAULT_WORKSPACE_ID } from "../ids";

export type Db = LibSQLDatabase<typeof schema>;

export type AppDb = {
  db: Db;
  client: Client;
};

const DDL = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  working_start_hour INTEGER NOT NULL DEFAULT 8,
  working_end_hour INTEGER NOT NULL DEFAULT 18,
  weekends_enabled INTEGER NOT NULL DEFAULT 0,
  protect_mode INTEGER NOT NULL DEFAULT 0,
  protect_daily_max INTEGER,
  sandbox INTEGER NOT NULL DEFAULT 1,
  kill_switch INTEGER NOT NULL DEFAULT 0,
  mcp_api_key TEXT NOT NULL DEFAULT 'dev-mcp-key',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sender_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  unipile_account_id TEXT,
  display_name TEXT NOT NULL,
  timezone TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  raw_import TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  email TEXT,
  linkedin_url TEXT,
  linkedin_url_normalized TEXT,
  opening_line TEXT NOT NULL DEFAULT '',
  public_url TEXT,
  custom_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS list_leads (
  list_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  UNIQUE(list_id, lead_id)
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  template_key TEXT,
  linkedin_sender_id TEXT,
  email_sender_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sequence_steps (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  channel TEXT NOT NULL,
  action TEXT NOT NULL,
  delay_hours INTEGER NOT NULL DEFAULT 0,
  body_template TEXT NOT NULL DEFAULT '',
  subject_template TEXT
);
CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  status TEXT NOT NULL,
  next_step_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS send_jobs (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  status TEXT NOT NULL,
  due_at TEXT NOT NULL,
  claimed_at TEXT,
  claimed_by TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  dry_run INTEGER NOT NULL DEFAULT 1,
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  subject TEXT,
  provider_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
`;

export function sqliteUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATABASE_URL ?? "file:./data/simplesequence.db";
}

export function createAppDb(url = sqliteUrlFromEnv()): AppDb {
  if (url.startsWith("file:")) {
    const filePath = url.replace(/^file:/, "");
    if (filePath !== ":memory:" && filePath !== "memory") {
      const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
    }
  }
  const client = createClient({ url });
  const db = drizzle(client, { schema });
  return { db, client };
}

export async function migrate(client: Client): Promise<void> {
  await client.executeMultiple(DDL);
}

export async function seedWorkspace(
  db: Db,
  opts?: { mcpApiKey?: string; now?: string },
): Promise<void> {
  const now = opts?.now ?? new Date().toISOString();
  const existing = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, DEFAULT_WORKSPACE_ID))
    .limit(1);
  if (existing[0]) return;
  await db.insert(schema.workspaces).values({
    id: DEFAULT_WORKSPACE_ID,
    name: "SimpleSequence",
    timezone: "America/Los_Angeles",
    workingStartHour: 8,
    workingEndHour: 18,
    weekendsEnabled: 0,
    protectMode: 0,
    protectDailyMax: null,
    sandbox: 1,
    killSwitch: 0,
    mcpApiKey: opts?.mcpApiKey ?? process.env.MCP_API_KEY ?? "dev-mcp-key",
    createdAt: now,
  });
  await db.insert(schema.users).values({
    id: DEFAULT_USER_ID,
    workspaceId: DEFAULT_WORKSPACE_ID,
    name: "Drew",
  });
}

let singleton: AppDb | null = null;

export async function getAppDb(): Promise<AppDb> {
  if (singleton) return singleton;
  const app = createAppDb();
  await migrate(app.client);
  await seedWorkspace(app.db);
  singleton = app;
  return app;
}

export async function resetSingleton(): Promise<void> {
  singleton = null;
}
