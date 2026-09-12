"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";

type Settings = {
  sandbox: number | boolean;
  protectMode: number | boolean;
  killSwitch: number | boolean;
  senders: Array<{ id: string; channel: string; status: string; displayName: string }>;
  workspace?: {
    timezone: string;
    protectMode: number;
    protectDailyMax: number | null;
    sandbox: number;
    killSwitch: number;
    mcpApiKey: string;
  };
};

export default function SettingsPage() {
  const [data, setData] = useState<Settings | null>(null);
  const [audit, setAudit] = useState<Array<{ id: string; action: string; createdAt: string }>>([]);
  const [max, setMax] = useState("");

  async function refresh() {
    const res = await fetch("/api/settings");
    setData(await res.json());
    const a = await fetch("/api/audit");
    setAudit(await a.json());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function patch(body: Record<string, unknown>) {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await refresh();
  }

  if (!data) {
    return (
      <AppShell>
        <p>Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-3xl">Settings</h1>
      <section className="mt-6 rounded-lg border border-(--line) bg-(--panel) p-4">
        <h2 className="text-xl">Accounts</h2>
        <p className="mt-1 text-sm text-(--muted)">Sandbox uses MockUnipile. Live send needs Unipile keys.</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="rounded-md bg-(--ink) px-4 py-2 text-(--panel)"
            onClick={async () => {
              await fetch("/api/accounts/linkedin/connect", { method: "POST" });
              await refresh();
            }}
          >
            Connect LinkedIn
          </button>
          <button
            type="button"
            className="rounded-md border border-(--line) px-4 py-2"
            onClick={async () => {
              await fetch("/api/accounts/email/connect", { method: "POST" });
              await refresh();
            }}
          >
            Connect mailbox
          </button>
        </div>
        <ul className="mt-3 text-sm">
          {data.senders.map((s) => (
            <li key={s.id}>
              {s.displayName} · {s.channel} · {s.status}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-lg border border-(--line) bg-(--panel) p-4">
        <h2 className="text-xl">Safety</h2>
        <p className="mt-1 text-sm text-(--muted)">
          Protect mode is off unless you turn it on and type your own daily max. No default ceiling.
        </p>
        <p className="mt-2 text-sm">Timezone: {data.workspace?.timezone}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-sm">
            Daily max
            <input
              className="ml-2 w-24 rounded border border-(--line) px-2 py-1"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              placeholder="e.g. 25"
            />
          </label>
          <button
            type="button"
            className="rounded-md border border-(--line) px-3 py-2 text-sm"
            onClick={() => void patch({ protectMode: true, protectDailyMax: Number(max) })}
          >
            Turn protect mode on
          </button>
          <button
            type="button"
            className="rounded-md border border-(--line) px-3 py-2 text-sm"
            onClick={() => void patch({ protectMode: false, protectDailyMax: null })}
          >
            Protect off
          </button>
          <button
            type="button"
            className="rounded-md border border-(--line) px-3 py-2 text-sm"
            onClick={() => void patch({ killSwitch: !data.workspace?.killSwitch })}
          >
            {data.workspace?.killSwitch ? "Clear kill switch" : "Kill switch"}
          </button>
        </div>
        <p className="mt-3 text-sm">MCP key: {data.workspace?.mcpApiKey}</p>
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
