"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatusBadge, Toggle } from "@/components/Toggle";
import { planExplain, planLabel } from "@/lib/domain/linkedinPlan";
import { linkedInProfileHref } from "@/lib/domain/linkedinProfile";
import { cursorMcpInstallHref, mcpClientConfigJson } from "@/lib/domain/mcpInstall";
import { useSettings, type SettingsSnapshot } from "@/lib/client/tabCaches";
import { activityLabel, formatWhen, timezoneLabel } from "@/lib/ui/display";

type Sender = {
  id: string;
  channel: string;
  status: string;
  displayName: string;
  unipileAccountId?: string | null;
  profileUrl?: string | null;
  linkedinPlan?: string | null;
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
  const [copiedKey, setCopiedKey] = useState(false);

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
        setNotice(selected ? `${selected.displayName} is connected.` : "Still waiting on the connection. Use Refresh accounts if this doesn’t update.");
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
        <PageHeader title="Settings" />
        <p className="mt-6 text-sm text-(--muted)">Loading…</p>
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
      <PageHeader
        title="Settings"
        lede="Connect LinkedIn and choose which account sends. Safety controls live here so a sequence never starts sending by surprise."
      />
      {error ? <p className="mt-4 text-sm text-(--danger)">{error}</p> : null}
      {notice ? <p className="mt-4 text-sm text-(--ok)">{notice}</p> : null}

      <section className="card mt-6 p-5">
        <h2 className="text-lg">LinkedIn</h2>
        <p className="mt-1 max-w-2xl text-sm text-(--muted)">
          Used for connection requests and LinkedIn messages. The selected account is the one that sends.
        </p>
        <ul className="mt-4 space-y-2">
          {linkedin.length === 0 ? <li className="empty">No LinkedIn accounts yet.</li> : null}
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
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                  selected ? "border-(--ochre) bg-(--tint)" : "border-(--line) bg-(--panel)"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{sender.displayName}</p>
                    <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                    {canReconnect ? <StatusBadge tone="muted">{planLabel(sender.linkedinPlan)}</StatusBadge> : null}
                    {selected ? <span className="text-xs font-medium text-(--ochre)">Selected</span> : null}
                  </div>
                  {profileHref ? (
                    <a
                      href={profileHref}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block truncate text-sm text-(--ochre) hover:underline"
                    >
                      {profileLabel(profileHref)}
                    </a>
                  ) : hint ? (
                    <p className="mt-1 text-sm text-(--muted)">Account · {hint}</p>
                  ) : null}
                  {canReconnect ? (
                    <p className="mt-1 max-w-xl text-sm text-(--muted)">{planExplain(sender.linkedinPlan)}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selected ? (
                    <span className="px-3 py-1.5 text-sm text-(--muted)">Sending from this account</span>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      className="btn btn-sm btn-quiet"
                      onClick={() => void patch({ linkedinSenderId: sender.id })}
                    >
                      Use this
                    </button>
                  )}
                  {canReconnect ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      className="btn btn-sm btn-quiet"
                      onClick={() => void reconnect(sender.id)}
                    >
                      {busy === `reconnect:${sender.id}` ? "Opening…" : "Reconnect"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    className="btn btn-sm btn-quiet-danger"
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
            className="btn btn-primary"
            onClick={() => void addLinkedIn()}
          >
            {busy === "add" ? "Opening…" : "Add LinkedIn"}
          </button>
          {data.liveKeys ? (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={async () => {
                await fetch("/api/accounts/sync", { method: "POST" });
                await refresh();
              }}
            >
              Refresh accounts
            </button>
          ) : (
            <p className="text-sm text-(--muted)">Practice mode is on, so Add LinkedIn creates a sandbox account.</p>
          )}
        </div>
      </section>

      <section className="card mt-6 p-5">
        <h2 className="text-lg">Safety</h2>
        <p className="mt-1 text-sm text-(--muted)">Times use {timezoneLabel(data.workspace?.timezone)}.</p>
        <div className="mt-4 divide-y divide-(--line)">
          <div className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0">
            <div>
              <p className="font-medium">Sandbox</p>
              <p className="mt-1 max-w-lg text-sm text-(--muted)">
                When this is on, nothing is sent. Turn it off when you want live LinkedIn sends.
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
            Connection cap, the gap between actions, and Check now are on{" "}
            <Link href="/frequency" className="text-(--ochre) hover:underline">
              Frequency
            </Link>
            . A higher-priority sequence takes the next slot. LinkedIn can still restrict an account.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-4 py-4 last:pb-0">
            <div>
              <p className="font-medium">Stop all sending</p>
              <p className="mt-1 max-w-lg text-sm text-(--muted)">
                Stops every running sequence immediately. Leave this off unless you need everything to halt.
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

      <section className="card mt-6 p-5">
        <h2 className="text-lg">Your agent</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-(--muted)">
          Add SimpleSequence in Cursor. Your agent can import LinkedIn URLs, draft a sequence, start it, and read the inbox. Import never sends on its own. Connecting LinkedIn stays on this page.
        </p>
        <p className="label mt-4">API key</p>
        <p className="field mt-1.5 max-w-sm font-mono tracking-wider">••••••••••••</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              const key = data.workspace?.mcpApiKey ?? "";
              void navigator.clipboard.writeText(key).then(() => {
                setCopiedKey(true);
                window.setTimeout(() => setCopiedKey(false), 2000);
              });
            }}
          >
            {copiedKey ? "Copied" : "Copy key"}
          </button>
          <a href={cursorMcpInstallHref(data.workspace?.mcpApiKey ?? "")} className="btn btn-primary">
            Add to Cursor
          </a>
          <button
            type="button"
            className="btn btn-quiet"
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
          Copy config is for Claude, or for pasting into Cursor by hand.
        </p>
      </section>

      <section className="card mt-6 p-5">
        <h2 className="text-lg">Trial</h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">Trial sender</p>
            <p className="mt-1 max-w-lg text-sm text-(--muted)">
              Opens a practice sender for trying a sequence. It stays out of the sidebar. Turning this off stops a trial that is running.
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

      <section className="card mt-6 p-5">
        <h2 className="text-lg">Activity</h2>
        {audit.length === 0 ? (
          <p className="mt-3 text-sm text-(--muted)">No activity yet.</p>
        ) : (
          <ul className="mt-3 max-h-80 overflow-auto text-sm">
            {audit
              .slice()
              .reverse()
              .map((row) => (
                <li key={row.id} className="flex items-baseline justify-between gap-4 border-b border-(--line) py-2 last:border-0">
                  <span>{activityLabel(row.action)}</span>
                  <span className="shrink-0 text-(--muted)">{formatWhen(row.createdAt)}</span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
