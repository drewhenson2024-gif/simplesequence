"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StatusBadge, Toggle } from "@/components/Toggle";
import { linkedInProfileHref } from "@/lib/domain/linkedinProfile";
import { cursorMcpInstallHref, mcpClientConfigJson } from "@/lib/domain/mcpInstall";
import { useSettings, type SettingsSnapshot } from "@/lib/client/tabCaches";

type Sender = {
  id: string;
  channel: string;
  status: string;
  displayName: string;
  unipileAccountId?: string | null;
  profileUrl?: string | null;
  lastError?: string | null;
};

function profileLabel(href: string) {
  const url = new URL(href);
  return `${url.hostname}${url.pathname}`.replace(/\/$/, "");
}

type Settings = SettingsSnapshot;

function accountState(sender: Sender, liveKeys: boolean) {
  const mock = !sender.unipileAccountId || sender.unipileAccountId.startsWith("mock_");
  if (sender.status === "restricted") return { tone: "danger" as const, label: "Restricted" };
  if (sender.lastError === "provider_throttle") {
    return { tone: "wait" as const, label: "Stopped — LinkedIn asked us to wait" };
  }
  if (sender.status === "pending") return { tone: "wait" as const, label: "Connecting" };
  if (sender.status === "healthy" && !mock) return { tone: "ok" as const, label: "Connected" };
  if (sender.status === "healthy" && mock) {
    return liveKeys
      ? { tone: "off" as const, label: "Not connected" }
      : { tone: "ok" as const, label: "Sandbox" };
  }
  return { tone: "muted" as const, label: sender.status };
}

function accountHint(sender: Sender) {
  const id = sender.unipileAccountId;
  if (!id || id.startsWith("mock_")) return null;
  return id.slice(-6);
}

export default function SettingsPage() {
  const router = useRouter();
  const { data: bundle, set: setBundle } = useSettings();
  const data = bundle?.settings ?? null;
  const audit = bundle?.audit ?? [];
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
        const selected = after.senders.find((s) => s.id === after.linkedinSenderId);
        setNotice(selected ? `${selected.displayName} is connected.` : "Still waiting on Unipile. Use Sync if this doesn’t update.");
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

  async function addLinkedIn() {
    setError(null);
    setBusy("add");
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
        await refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function reconnect(senderId: string) {
    setError(null);
    setBusy(`reconnect:${senderId}`);
    try {
      const res = await fetch("/api/accounts/linkedin/reconnect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ senderId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not start reconnect");
        return;
      }
      if (body.authUrl) window.location.href = body.authUrl;
    } finally {
      setBusy(null);
    }
  }

  async function removeAccount(senderId: string) {
    setError(null);
    setBusy(`remove:${senderId}`);
    try {
      const res = await fetch("/api/accounts/linkedin/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ senderId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not remove LinkedIn");
        return;
      }
      await refresh();
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

  const linkedin = data.senders.filter((s) => s.channel === "linkedin");
  const selectedId = data.linkedinSenderId ?? null;
  const sandboxOn = Boolean(data.workspace?.sandbox);
  const killOn = Boolean(data.workspace?.killSwitch);
  const trialOn = Boolean(data.developerTrial ?? data.workspace?.developerTrial);

  return (
    <AppShell>
      <h1 className="text-2xl tracking-tight">Settings</h1>
      <p className="mt-1 max-w-2xl text-sm text-(--muted)">
        Connect LinkedIn. Pick which account sends. Safety switches live here so a sequence never starts sending by surprise.
      </p>
      {error ? <p className="mt-4 text-sm text-(--danger)">{error}</p> : null}
      {notice ? <p className="mt-4 text-sm text-(--ok)">{notice}</p> : null}

      <section className="mt-6">
        <h2 className="text-xl">LinkedIn</h2>
        <p className="mt-1 max-w-2xl text-sm text-(--muted)">
          Used for connection requests and LinkedIn messages. The selected account is the one that sends.
        </p>
        <ul className="mt-4 space-y-2">
          {linkedin.length === 0 ? (
            <li className="rounded-2xl border border-(--line) bg-(--panel) px-4 py-3 text-sm text-(--muted)">
              No LinkedIn accounts yet.
            </li>
          ) : null}
          {linkedin.map((sender) => {
            const state = accountState(sender, Boolean(data.liveKeys));
            const selected = sender.id === selectedId;
            const hint = accountHint(sender);
            const profileHref = linkedInProfileHref(sender.profileUrl);
            const canReconnect = Boolean(
              sender.unipileAccountId && !sender.unipileAccountId.startsWith("mock_"),
            );
            return (
              <li
                key={sender.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-(--panel) px-4 py-3 ${
                  selected ? "border-(--ochre)" : "border-(--line)"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{sender.displayName}</p>
                    <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                    {selected ? <span className="text-xs font-medium uppercase tracking-wide text-(--ochre)">Selected</span> : null}
                  </div>
                  {profileHref ? (
                    <a
                      href={profileHref}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block truncate text-sm text-(--ochre) underline"
                    >
                      {profileLabel(profileHref)}
                    </a>
                  ) : hint ? (
                    <p className="mt-1 text-sm text-(--muted)">Account · {hint}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selected ? (
                    <span className="px-3 py-1.5 text-sm text-(--muted)">Sending from this account</span>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      className="rounded-full border border-(--line) px-3 py-1.5 text-sm disabled:opacity-40"
                      onClick={() => void patch({ linkedinSenderId: sender.id })}
                    >
                      Use this
                    </button>
                  )}
                  {canReconnect ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      className="rounded-full border border-(--line) px-3 py-1.5 text-sm disabled:opacity-40"
                      onClick={() => void reconnect(sender.id)}
                    >
                      {busy === `reconnect:${sender.id}` ? "Opening…" : "Reconnect"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    className="rounded-full border border-(--line) px-3 py-1.5 text-sm disabled:opacity-40"
                    onClick={() => void removeAccount(sender.id)}
                  >
                    {busy === `remove:${sender.id}` ? "Removing…" : "Remove"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={Boolean(busy)}
            className="btn-primary rounded-full px-4 py-2 disabled:opacity-40"
            onClick={() => void addLinkedIn()}
          >
            {busy === "add" ? "Opening…" : "Add LinkedIn"}
          </button>
          {data.liveKeys ? (
            <button
              type="button"
              className="rounded-full border border-(--line) px-4 py-2 text-sm"
              onClick={async () => {
                await fetch("/api/accounts/sync", { method: "POST" });
                await refresh();
              }}
            >
              Sync Unipile accounts
            </button>
          ) : (
            <p className="text-sm text-(--muted)">Unipile keys aren’t loaded, so Add LinkedIn uses a sandbox account.</p>
          )}
        </div>
      </section>

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
            Connection cap and the gap between actions are on <Link href="/frequency">Frequency</Link>. A
            higher-priority sequence takes the next slot. LinkedIn can still restrict an account.
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
      </section>

      <section className="mt-8 rounded-lg border border-(--line) bg-(--panel) p-4">
        <h2 className="text-xl">Cursor</h2>
        <p className="mt-1 max-w-2xl text-sm text-(--muted)">
          Add SimpleSequence in Cursor. An agent can import LinkedIn URLs, draft a sequence, Start, and
          read the inbox. Import never sends on its own. Connecting LinkedIn stays on this page.
        </p>
        <p className="mt-4 text-sm text-(--muted)">Key</p>
        <p className="mt-1 font-mono text-sm">{data.workspace?.mcpApiKey}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a href={cursorMcpInstallHref(data.workspace?.mcpApiKey ?? "")} className="btn-primary rounded-full px-4 py-2 text-sm">
            Add to Cursor
          </a>
          <button
            type="button"
            className="rounded-full border border-(--line) px-4 py-2 text-sm"
            onClick={() => {
              const key = data.workspace?.mcpApiKey ?? "";
              void navigator.clipboard.writeText(mcpClientConfigJson(key)).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied ? "Copied" : "Copy config"}
          </button>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-(--muted)">
          Copy config is the same server, for Claude or for pasting into Cursor by hand.
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-(--line) bg-(--panel) p-4">
        <h2 className="text-xl">Developer</h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">Developer trial</p>
            <p className="mt-1 max-w-lg text-sm text-(--muted)">
              On opens the trial sender. It stays out of the sidebar. Off stops a trial that is running.
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
