"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StatusBadge, Toggle } from "@/components/Toggle";
import { LINKEDIN_INVITE_DAILY_CAP } from "@/lib/domain/linkedinSafety";
import { useSettings, type SettingsSnapshot } from "@/lib/client/tabCaches";

type Sender = {
  id: string;
  channel: string;
  status: string;
  displayName: string;
  unipileAccountId?: string | null;
  lastError?: string | null;
};

type Settings = SettingsSnapshot;

function pickSender(senders: Sender[]): Sender | undefined {
  const rows = senders.filter((s) => s.channel === "linkedin");
  return (
    rows.find((s) => s.status === "healthy" && s.unipileAccountId && !s.unipileAccountId.startsWith("mock_")) ??
    rows.find((s) => s.status === "healthy") ??
    rows[0]
  );
}

function accountState(sender: Sender | undefined, liveKeys: boolean) {
  if (!sender) return { tone: "off" as const, label: "Not connected", live: false };
  const mock = !sender.unipileAccountId || sender.unipileAccountId.startsWith("mock_");
  if (sender.status === "restricted") return { tone: "danger" as const, label: "Restricted", live: false };
  if (sender.lastError === "provider_throttle") {
    return { tone: "wait" as const, label: "Stopped — LinkedIn asked us to wait", live: !mock };
  }
  if (sender.status === "pending") return { tone: "wait" as const, label: "Connecting…", live: false };
  if (sender.status === "healthy" && !mock) return { tone: "ok" as const, label: "Connected", live: true };
  if (sender.status === "healthy" && mock) {
    return liveKeys
      ? { tone: "off" as const, label: "Not connected", live: false }
      : { tone: "ok" as const, label: "Sandbox", live: false };
  }
  return { tone: "muted" as const, label: sender.status, live: false };
}

export default function SettingsPage() {
  const router = useRouter();
  const { data: bundle, set: setBundle } = useSettings();
  const data = bundle?.settings ?? null;
  const audit = bundle?.audit ?? [];
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [res, a] = await Promise.all([fetch("/api/settings"), fetch("/api/audit")]);
    const json = (await res.json()) as Settings;
    const nextAudit = await a.json();
    setBundle({ settings: json, audit: Array.isArray(nextAudit) ? nextAudit : [] });
    return json;
  }

  useEffect(() => {
    void (async () => {
      const q = new URLSearchParams(window.location.search);
      const connected = q.get("connected");
      if (connected === "failed") setError("Connect failed. Try again.");
      else if (connected === "linkedin") setNotice("LinkedIn returned. Syncing…");
      const first = bundle?.settings ?? (await refresh());
      if (connected === "linkedin" && first.liveKeys) {
        await fetch("/api/accounts/sync", { method: "POST" });
        const after = await refresh();
        const sender = pickSender(after.senders);
        const state = accountState(sender, true);
        setNotice(state.live ? "LinkedIn is connected." : "Still waiting on Unipile. Use Sync if this doesn’t update.");
      }
      if (connected) window.history.replaceState({}, "", "/settings");
    })();
  }, []);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Could not save settings");
      return false;
    }
    setBundle({ settings: json as Settings, audit });
    return true;
  }

  async function connect() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/accounts/linkedin/connect", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not start connect");
        return;
      }
      if (body.authUrl && data?.liveKeys) window.location.href = body.authUrl;
      else {
        setNotice("Sandbox LinkedIn is ready.");
        const resSettings = await fetch("/api/settings");
        setBundle({ settings: (await resSettings.json()) as Settings, audit });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <AppShell>
        <p>Loading…</p>
      </AppShell>
    );
  }

  const linkedin = pickSender(data.senders);
  const li = accountState(linkedin, Boolean(data.liveKeys));
  const sandboxOn = Boolean(data.workspace?.sandbox);
  const killOn = Boolean(data.workspace?.killSwitch);
  const trialOn = Boolean(data.developerTrial ?? data.workspace?.developerTrial);

  return (
    <AppShell>
      <h1 className="text-3xl">Settings</h1>
      <p className="mt-2 max-w-2xl text-(--muted)">
        Connect LinkedIn. Safety switches live here so a sequence never starts sending by surprise.
      </p>
      {error ? <p className="mt-4 text-sm text-(--danger)">{error}</p> : null}
      {notice ? <p className="mt-4 text-sm text-(--ok)">{notice}</p> : null}

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <AccountCard
          title="LinkedIn"
          hint="Used for connection requests and LinkedIn messages."
          state={li}
          name={li.live || (!data.liveKeys && linkedin) ? linkedin?.displayName : undefined}
          busy={busy}
          actionLabel={li.live ? "Reconnect" : "Connect LinkedIn"}
          onConnect={() => void connect()}
        />
      </section>
      {data.liveKeys ? (
        <button
          type="button"
          className="mt-3 rounded-2xl border border-(--line) px-4 py-1.5 text-sm"
          onClick={async () => {
            await fetch("/api/accounts/sync", { method: "POST" });
            const res = await fetch("/api/settings");
            setBundle({ settings: (await res.json()) as Settings, audit });
          }}
        >
          Sync Unipile accounts
        </button>
      ) : (
        <p className="mt-3 text-sm text-(--muted)">Unipile keys aren’t loaded, so Connect uses a sandbox account.</p>
      )}

      <section className="mt-8 rounded-lg border border-(--line) bg-(--panel) p-4">
        <h2 className="text-xl">Safety</h2>
        <p className="mt-1 text-sm text-(--muted)">Timezone: {data.workspace?.timezone}</p>
        <div className="mt-4 divide-y divide-(--line)">
          <div className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0">
            <div>
              <p className="font-medium">Sandbox</p>
              <p className="mt-1 max-w-lg text-sm text-(--muted)">
                On = practice. Nothing is actually sent. Turn this off only when you want live send.
              </p>
            </div>
            <Toggle
              on={sandboxOn}
              onLabel="On"
              offLabel="Off"
              onChange={(next) => void patch({ sandbox: next })}
            />
          </div>
          <p className="py-4 text-sm text-(--muted)">
            LinkedIn connection requests cap at {LINKEDIN_INVITE_DAILY_CAP} per sender per day, with working hours, jitter,
            and one in-flight send. That follows Unipile’s conservative pace — LinkedIn can still
            restrict an account.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-4 py-4 last:pb-0">
            <div>
              <p className="font-medium">Kill switch</p>
              <p className="mt-1 max-w-lg text-sm text-(--muted)">
                Stops every running sequence immediately. Leave this off unless you need a hard stop.
              </p>
            </div>
            <Toggle
              on={killOn}
              onLabel="Stopped"
              offLabel="Off"
              danger
              onChange={(next) => void patch({ killSwitch: next })}
            />
          </div>
        </div>
        <p className="mt-4 text-sm text-(--muted)">MCP key: {data.workspace?.mcpApiKey}</p>
        <p className="mt-2 max-w-2xl text-sm text-(--muted)">
          Cursor MCP: URL https://simplesequence-three.vercel.app/mcp with header X-API-Key set to
          that key. Agents can import URLs, draft, Start, inbox, and analytics. Import never auto-sends.
          Connecting LinkedIn is this page.
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-(--line) bg-(--panel) p-4">
        <h2 className="text-xl">Developer</h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">Developer trial</p>
            <p className="mt-1 max-w-lg text-sm text-(--muted)">
              On = Trial appears in the top nav. Pace LinkedIn actions and keep a history of each
              run. Does not create LinkedIn accounts.
            </p>
          </div>
          <Toggle
            on={trialOn}
            onLabel="On"
            offLabel="Off"
            onChange={(next) =>
              void (async () => {
                const ok = await patch({ developerTrial: next });
                if (ok && next) router.push("/trials");
              })()
            }
          />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-(--line) bg-(--panel) p-4">
        <h2 className="text-xl">Audit log</h2>
        <ul className="mt-3 max-h-80 overflow-auto text-sm">
          {audit
            .slice()
            .reverse()
            .map((row) => (
              <li key={row.id}>
                {row.createdAt} · {row.action}
              </li>
            ))}
        </ul>
      </section>
    </AppShell>
  );
}

function AccountCard({
  title,
  hint,
  state,
  name,
  busy,
  actionLabel,
  onConnect,
}: {
  title: string;
  hint: string;
  state: { tone: "ok" | "off" | "wait" | "danger" | "muted"; label: string };
  name?: string;
  busy: boolean;
  actionLabel: string;
  onConnect: () => void;
}) {
  return (
    <div className="rounded-lg border border-(--line) bg-(--panel) p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl">{title}</h2>
        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
      </div>
      <p className="mt-2 text-sm text-(--muted)">{hint}</p>
      {name ? <p className="mt-3 font-medium">{name}</p> : <p className="mt-3 text-sm text-(--muted)">No account yet.</p>}
      <button
        type="button"
        disabled={busy}
        className="btn-primary mt-4 rounded-2xl px-4 py-2 disabled:opacity-40"
        onClick={onConnect}
      >
        {busy ? "Opening…" : actionLabel}
      </button>
    </div>
  );
}
