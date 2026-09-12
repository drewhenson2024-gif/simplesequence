"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";

type Campaign = {
  id: string;
  name: string;
  status: string;
  steps: Array<{
    stepIndex: number;
    channel: string;
    action: string;
    delayHours: number;
    bodyTemplate: string;
    subjectTemplate: string | null;
  }>;
  enrollments: Array<{ id: string; status: string; lead: { fullName: string; email: string | null } | null }>;
  enrollmentCounts: Record<string, number>;
  samples: Array<{
    lead: { fullName: string };
    previews: Array<{ stepIndex: number; body: string; subject: string | null }>;
  }>;
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Campaign | null>(null);
  const [lists, setLists] = useState<Array<{ id: string; name: string }>>([]);
  const [listId, setListId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/campaigns/${params.id}`);
    setData(await res.json());
  }

  useEffect(() => {
    void refresh();
    void (async () => {
      const res = await fetch("/api/lists");
      const rows = await res.json();
      setLists(rows);
      if (rows[0]) setListId(rows[0].id);
    })();
  }, [params.id]);

  async function addLeads() {
    setError(null);
    const res = await fetch(`/api/campaigns/${params.id}/leads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listId }),
    });
    const body = await res.json();
    if (!res.ok) setError(body.error);
    await refresh();
  }

  async function start() {
    if (!window.confirm("Start sending? This is the explicit start action.")) return;
    const res = await fetch(`/api/campaigns/${params.id}/start`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) setError(body.error);
    await refresh();
  }

  async function pause() {
    await fetch(`/api/campaigns/${params.id}/pause`, { method: "POST" });
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-(--muted)">{data.status}</p>
          <h1 className="text-3xl">{data.name}</h1>
        </div>
        <div className="flex gap-2">
          {data.status === "draft" || data.status === "paused" ? (
            <button type="button" onClick={() => void start()} className="rounded-md bg-(--ink) px-4 py-2 text-(--panel)">
              Start
            </button>
          ) : null}
          {data.status === "running" ? (
            <button type="button" onClick={() => void pause()} className="rounded-md border border-(--line) px-4 py-2">
              Pause
            </button>
          ) : null}
        </div>
      </div>
      {data.status === "draft" ? (
        <p className="mt-3 rounded border border-(--line) bg-(--panel) px-3 py-2 text-sm">
          This is a draft — nothing is sent until you hit Start.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-800">{error}</p> : null}

      <h2 className="mt-8 text-xl">Steps</h2>
      <ol className="mt-3 space-y-3">
        {data.steps.map((step) => (
          <li key={step.stepIndex} className="rounded border border-(--line) bg-(--panel) p-3">
            <div className="text-sm text-(--muted)">
              {step.stepIndex + 1}. {step.channel} / {step.action} · wait {step.delayHours}h
            </div>
            {step.subjectTemplate ? <p className="mt-1 text-sm">{step.subjectTemplate}</p> : null}
            <p className="mt-1 whitespace-pre-wrap text-sm">{step.bodyTemplate}</p>
          </li>
        ))}
      </ol>

      <h2 className="mt-8 text-xl">Leads</h2>
      <div className="mt-3 flex gap-2">
        <select
          className="rounded border border-(--line) bg-white px-3 py-2"
          value={listId}
          onChange={(e) => setListId(e.target.value)}
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void addLeads()} className="rounded-md border border-(--line) px-4 py-2">
          Add from list
        </button>
      </div>
      <p className="mt-2 text-sm text-(--muted)">Counts: {JSON.stringify(data.enrollmentCounts)}</p>
      <ul className="mt-3 text-sm">
        {data.enrollments.map((e) => (
          <li key={e.id}>
            {e.lead?.fullName ?? e.id} — {e.status}
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-xl">Merge preview</h2>
      {data.samples.map((sample) => (
        <div key={sample.lead.fullName} className="mt-3 rounded border border-(--line) bg-(--panel) p-3">
          <p className="font-medium">{sample.lead.fullName}</p>
          {sample.previews.map((p) => (
            <pre key={p.stepIndex} className="mt-2 whitespace-pre-wrap text-xs">
              {p.subject ? `Subject: ${p.subject}\n` : ""}
              {p.body}
            </pre>
          ))}
        </div>
      ))}
    </AppShell>
  );
}
