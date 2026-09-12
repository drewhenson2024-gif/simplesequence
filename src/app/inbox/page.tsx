"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";

type Msg = {
  id: string;
  channel: string;
  direction: string;
  body: string;
  enrollmentId: string;
  lead: { fullName: string } | null;
};

export default function InboxPage() {
  const [rows, setRows] = useState<Msg[]>([]);

  async function refresh() {
    const res = await fetch("/api/inbox");
    setRows(await res.json());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function stop(enrollmentId: string) {
    await fetch("/api/inbox/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enrollmentId }),
    });
    await refresh();
  }

  return (
    <AppShell>
      <h1 className="text-3xl">Inbox</h1>
      <ul className="mt-6 space-y-3">
        {rows.length === 0 ? <p className="text-(--muted)">No messages yet.</p> : null}
        {rows.map((m) => (
          <li key={m.id} className="rounded border border-(--line) bg-(--panel) p-4">
            <div className="flex items-center justify-between text-sm text-(--muted)">
              <span>
                {m.lead?.fullName ?? "Unknown"} · {m.channel} · {m.direction}
              </span>
              <button type="button" className="underline" onClick={() => void stop(m.enrollmentId)}>
                Stop lead
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
