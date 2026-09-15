"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";

type Qualification = { decision?: string; explanation?: string; score?: number; reason?: string };

type Lead = {
  id: string;
  fullName: string;
  company: string;
  title: string;
  email: string | null;
  linkedinUrlNormalized: string | null;
  openingLine?: string;
  publicUrl?: string | null;
  customJson?: string;
};

function customOf(lead: Lead): Record<string, unknown> {
  try {
    return JSON.parse(lead.customJson || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function qualificationOf(lead: Lead): Qualification {
  const custom = customOf(lead);
  return (custom.qualification as Qualification) ?? {};
}

function sourceOf(lead: Lead): string {
  const custom = customOf(lead);
  const source = typeof custom.custom_source === "string" ? custom.custom_source : "import";
  if (source === "stub_catalog") return "—";
  return source;
}

function scoreOf(lead: Lead): number | null {
  const custom = customOf(lead);
  const q = qualificationOf(lead);
  if (typeof custom.score === "number") return custom.score;
  if (typeof q.score === "number") return q.score;
  return null;
}

export default function ListDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{ name: string; leads: Lead[] } | null>(null);
  const [criteria, setCriteria] = useState("Current technical role at US headquarters");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/lists/${params.id}`);
    setData(await res.json());
  }

  useEffect(() => {
    void refresh();
  }, [params.id]);

  async function research() {
    setBusy("research");
    setError(null);
    try {
      const res = await fetch(`/api/lists/${params.id}/research`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "research failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "research failed");
    } finally {
      setBusy(null);
    }
  }

  async function qualify() {
    setBusy("qualify");
    setError(null);
    try {
      const res = await fetch(`/api/lists/${params.id}/qualify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ criteria }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "qualify failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "qualify failed");
    } finally {
      setBusy(null);
    }
  }

  async function exportCrm() {
    setBusy("export");
    setError(null);
    try {
      const res = await fetch(`/api/lists/${params.id}/export`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "export failed");
      setExportResult(`${body.contacts?.length ?? 0} contacts → ${body.destination} (not sent)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "export failed");
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

  return (
    <AppShell>
      <h1 className="text-3xl">{data.name}</h1>
      <p className="mt-2 text-sm text-(--muted)">
        Research fills an opening line and public URL. Qualify stores fit / maybe / no plus a numeric
        score. Export writes a CRM-ready payload — it does not send messages.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() => void research()}
          disabled={busy !== null}
          className="rounded-md bg-(--ink) px-4 py-2 text-(--panel)"
        >
          {busy === "research" ? "Researching…" : "Research"}
        </button>
        <label className="text-sm text-(--muted)">
          Criteria
          <input
            className="ml-2 w-80 max-w-full rounded border border-(--line) bg-(--input) px-3 py-2"
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void qualify()}
          disabled={busy !== null}
          className="rounded-md border border-(--line) px-4 py-2"
        >
          {busy === "qualify" ? "Scoring…" : "Score / qualify"}
        </button>
        <button
          type="button"
          onClick={() => void exportCrm()}
          disabled={busy !== null}
          className="rounded-md border border-(--line) px-4 py-2"
        >
          {busy === "export" ? "Exporting…" : "Export to CRM"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-(--danger)">{error}</p> : null}
      {exportResult ? <p className="mt-3 text-sm text-(--muted)">{exportResult}</p> : null}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[72rem] text-left text-sm">
          <thead>
            <tr className="border-b border-(--line) text-(--muted)">
              <th className="py-2 pr-4">Name</th>
              <th className="pr-4">Company</th>
              <th className="pr-4">Title</th>
              <th className="pr-4">Source</th>
              <th className="pr-4">Score</th>
              <th className="pr-4">Opener</th>
              <th className="pr-4">Public URL</th>
              <th className="pr-4">Fit</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {data.leads.map((lead) => {
              const q = qualificationOf(lead);
              const score = scoreOf(lead);
              return (
                <tr key={lead.id} className="border-b border-(--line)">
                  <td className="py-2 pr-4">{lead.fullName}</td>
                  <td className="pr-4">{lead.company}</td>
                  <td className="pr-4">{lead.title}</td>
                  <td className="pr-4">{sourceOf(lead)}</td>
                  <td className="pr-4">{score ?? "—"}</td>
                  <td className="max-w-48 truncate pr-4">{lead.openingLine}</td>
                  <td className="max-w-48 truncate pr-4">{lead.publicUrl}</td>
                  <td className="pr-4">{q.decision ?? "—"}</td>
                  <td className="max-w-64 truncate">{q.reason ?? q.explanation ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
