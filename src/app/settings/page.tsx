"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatusBadge, Toggle } from "@/components/Toggle";

type Sender = {
  id: string;
  channel: string;
  status: string;
  displayName: string;
  unipileAccountId?: string | null;
};

type Settings = {
  sandbox: number | boolean;
  killSwitch: number | boolean;
  liveKeys?: boolean;
  senders: Sender[];
  workspace?: {
    timezone: string;
    sandbox: number;
    killSwitch: number;
    mcpApiKey: string;
  };
};

function pickSender(senders: Sender[], channel: "linkedin" | "email"): Sender | undefined {
  const rows = senders.filter((s) => s.channel === channel);
  return (
    rows.find((s) => s.status === "healthy" && s.unipileAccountId && !s.unipileAccountId.startsWith("mock_")) ??
    rows.find((s) => s.status === "healthy") ??
    rows[0]
  );
}

function accountState(sender: Sender | undefined, liveKeys: boolean) {
  if (!sender) return { tone: "off" as const, label: "Not connected", live: false };
  const mock = !sender.unipileAccountId || sender.unipileAccountId.startsWith("mock_");
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
  const [data, setData] = useState<Settings | null>(null);
  const [audit, setAudit] = useState<Array<{ id: string; action: string; createdAt: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"linkedin" | "email" | null>(null);

  async function refresh() {
    const res = await fetch("/api/settings");
    const json = (await res.json()) as Settings;
    setData(json);
    const a = await fetch("/api/audit");
    setAudit(await a.json());
    return json;
  }

  useEffect(() => {
    void (async () => {
      const q = new URLSearchParams(window.location.search);
      const connected = q.get("connected");
      if (connected === "failed") setError("Connect failed. Try again.");
      else if (connected === "linkedin") setNotice("LinkedIn returned. Syncing…");
      else if (connected === "email") setNotice("Mailbox returned. Syncing…");
      const first = await refresh();
      if (first.liveKeys) {
        await fetch("/api/accounts/sync", { method: "POST" });
        const after = await refresh();
        if (connected === "linkedin" || connected === "email") {
          const sender = pickSender(after.senders, connected);
          const state = accountState(sender, true);
          setNotice(state.live ? `${connected === "linkedin" ? "LinkedIn" : "Mailbox"} is connected.` : "Still waiting on Unipile. Use Sync if this doesn’t update.");
        }
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
      return;
    }
    await refresh();
  }

  async function connect(channel: "linkedin" | "email") {
    setError(null);
    setBusy(channel);
    try {
      const res = await fetch(`/api/accounts/${channel}/connect`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not start connect");
        return;
      }
      if (body.authUrl && data?.liveKeys) window.location.href = body.authUrl;
      else {
        setNotice(channel === "linkedin" ? "Sandbox LinkedIn is ready." : "Sandbox mailbox is ready.");
        await refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <AppShell>
        <p>Loading…</p>
      </AppShell>
    );
  }

  const linkedin = pickSender(data.senders, "linkedin");
  const email = pickSender(data.senders, "email");
  const li = accountState(linkedin, Boolean(data.liveKeys));
  const mail = accountState(email, Boolean(data.liveKeys));
  const sandboxOn = Boolean(data.workspace?.sandbox);
  const killOn = Boolean(data.workspace?.killSwitch);

  return (
    <AppShell>
      <h1 className="text-3xl">Settings</h1>
      <p className="mt-2 max-w-2xl text-(--muted)">
        Connect the accounts that send. Safety switches live here so a sequence never starts sending by
        surprise.
      </p>
      {error ? <p className="mt-4 text-sm text-(--danger)">{error}</p> : null}
      {notice ? <p className="mt-4 text-sm text-(--ok)">{notice}</p> : null}

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <AccountCard
          title="LinkedIn"
          hint="Used for connection requests and LinkedIn messages."
          state={li}
          name={li.live || (!data.liveKeys && linkedin) ? linkedin?.displayName : undefined}
          busy={busy === "linkedin"}
          actionLabel={li.live ? "Reconnect" : "Connect LinkedIn"}
          onConnect={() => void connect("linkedin")}
        />
        <AccountCard
          title="Mailbox"
          hint="Email steps need a mailbox. Connect Google or Outlook via Unipile before you Start a mixed sequence. Leave sandbox on until you want live send."
          state={mail}
          name={mail.live || (!data.liveKeys && email) ? email?.displayName : undefined}
          busy={busy === "email"}
          actionLabel={mail.live ? "Reconnect" : "Connect mailbox"}
          onConnect={() => void connect("email")}
        />
      </section>
      {data.liveKeys ? (
        <button
          type="button"
          className="mt-3 text-sm text-(--muted) underline"
          onClick={async () => {
            await fetch("/api/accounts/sync", { method: "POST" });
            await refresh();
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
          that key. Agents save drafts only — Start is what sends.
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-(--line) bg-(--panel) p-4">
        <h2 className="text-xl">Later</h2>
        <p className="mt-1 text-sm text-(--muted)">
          People search, in-market signals, and courier gifts wait until those vendors are connected.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/signals" className="underline">
            Signals
          </Link>
          <span className="text-(--muted)"> — coming soon</span>
        </p>
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
  state: { tone: "ok" | "off" | "wait" | "muted"; label: string };
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
        className="mt-4 rounded-md bg-(--ink) px-4 py-2 text-(--panel) disabled:opacity-40"
        onClick={onConnect}
      >
        {busy ? "Opening…" : actionLabel}
      </button>
    </div>
  );
}
