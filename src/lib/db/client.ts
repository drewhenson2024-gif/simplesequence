import { eq } from "drizzle-orm";
import { createClient, type Client } from "@libsql/client";
import { createClient as createWebClient } from "@libsql/client/web";
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
  developer_trial INTEGER NOT NULL DEFAULT 0,
  linkedin_sender_id TEXT,
  connection_cap INTEGER NOT NULL DEFAULT 25,
  min_gap_minutes INTEGER NOT NULL DEFAULT 2,
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
  profile_url TEXT,
  linkedin_plan TEXT,
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
  headline TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
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
  priority INTEGER NOT NULL DEFAULT 0,
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
  subject_template TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  skip_overdue_hours INTEGER NOT NULL DEFAULT 72,
  image_url TEXT
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
CREATE TABLE IF NOT EXISTS trial_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL,
  action TEXT NOT NULL,
  interval_seconds INTEGER NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  urls_json TEXT NOT NULL,
  next_index INTEGER NOT NULL DEFAULT 0,
  sender_id TEXT,
  dry_run INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT
);
CREATE TABLE IF NOT EXISTS trial_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  url TEXT NOT NULL,
  at TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  restricted INTEGER NOT NULL DEFAULT 0,
  throttled INTEGER NOT NULL DEFAULT 0,
  quota INTEGER NOT NULL DEFAULT 0,
  dry_run INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  lead_id TEXT,
  signal_type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  person_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'stub_catalog',
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

function isRemoteLibsql(url: string): boolean {
  return /^(libsql|https|wss):\/\//i.test(url);
}

export function sqliteUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TURSO_DATABASE_URL) return env.TURSO_DATABASE_URL;
  if (env.DATABASE_URL && isRemoteLibsql(env.DATABASE_URL)) return env.DATABASE_URL;
  throw new Error(
    "Set TURSO_DATABASE_URL. SimpleSequence runs on Vercel + Turso (https://simplesequence-three.vercel.app), not a local SQLite file.",
  );
}

export function createAppDb(url = sqliteUrlFromEnv()): AppDb {
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  const client = isRemoteLibsql(url)
    ? createWebClient({ url, authToken })
    : createClient({ url });
  const db = drizzle(client, { schema });
  return { db, client };
}

const SCHEMA_VERSION = 10;

async function readSchemaVersion(client: Client): Promise<number> {
  try {
    const result = await client.execute("SELECT value FROM schema_meta WHERE key = 'version' LIMIT 1");
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return Number(row?.value ?? 0);
  } catch {
    return 0;
  }
}

export async function migrate(client: Client): Promise<void> {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  const version = await readSchemaVersion(client);
  if (version >= SCHEMA_VERSION) return;
  await client.executeMultiple(DDL);
  for (const sql of [
    "ALTER TABLE sequence_steps ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE sequence_steps ADD COLUMN skip_overdue_hours INTEGER NOT NULL DEFAULT 72",
    "ALTER TABLE sequence_steps ADD COLUMN image_url TEXT",
    "ALTER TABLE leads ADD COLUMN headline TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE leads ADD COLUMN location TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE leads ADD COLUMN about TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE workspaces ADD COLUMN developer_trial INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE workspaces ADD COLUMN linkedin_sender_id TEXT",
    "ALTER TABLE sender_accounts ADD COLUMN profile_url TEXT",
    "ALTER TABLE sender_accounts ADD COLUMN linkedin_plan TEXT",
    "ALTER TABLE campaigns ADD COLUMN priority INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE workspaces ADD COLUMN connection_cap INTEGER NOT NULL DEFAULT 25",
    "ALTER TABLE workspaces ADD COLUMN min_gap_minutes INTEGER NOT NULL DEFAULT 2",
  ]) {
    try {
      await client.execute(sql);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column/i.test(msg)) throw err;
    }
  }
  await client.executeMultiple(`
DELETE FROM messages WHERE enrollment_id IN (
  SELECT id FROM enrollments WHERE campaign_id IN (
    SELECT id FROM campaigns WHERE name IN ('Live gift draft', 'Live gift draft · learnings')
  )
);
DELETE FROM send_jobs WHERE campaign_id IN (
  SELECT id FROM campaigns WHERE name IN ('Live gift draft', 'Live gift draft · learnings')
);
DELETE FROM enrollments WHERE campaign_id IN (
  SELECT id FROM campaigns WHERE name IN ('Live gift draft', 'Live gift draft · learnings')
);
DELETE FROM sequence_steps WHERE campaign_id IN (
  SELECT id FROM campaigns WHERE name IN ('Live gift draft', 'Live gift draft · learnings')
);
DELETE FROM campaigns WHERE name IN ('Live gift draft', 'Live gift draft · learnings');
DELETE FROM sender_accounts WHERE channel = 'gift';
DELETE FROM sender_accounts WHERE channel = 'email';
DELETE FROM sequence_steps WHERE channel = 'email' OR action = 'email';
DELETE FROM signals;
`);
  for (const sql of [
    "ALTER TABLE sequence_steps DROP COLUMN gift_item",
    "ALTER TABLE sequence_steps DROP COLUMN gift_note",
    "ALTER TABLE campaigns DROP COLUMN gift_sender_id",
    "ALTER TABLE campaigns DROP COLUMN email_sender_id",
  ]) {
    try {
      await client.execute(sql);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/no such column|duplicate column/i.test(msg)) throw err;
    }
  }
  await client.execute({
    sql: "INSERT INTO schema_meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: ["version", String(SCHEMA_VERSION)],
  });
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
