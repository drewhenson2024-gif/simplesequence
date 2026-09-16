"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell, BackLink } from "@/components/AppShell";
import { scheduleDelete } from "@/lib/client/pendingDelete";

type Lead = {
  id: string;
  fullName: string;
  company?: string;
  title?: string;
  openingLine?: string;
  linkedinUrlNormalized: string | null;
  linkedinUrl?: string | null;
};

export default function ListDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<{ name: string; leads: Lead[] } | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/lists/${params.id}`);
    const body = await res.json();
    setData(body);
    if (body?.name) setName(body.name);
  }

  useEffect(() => {
    void refresh();
  }, [params.id]);

  async function saveName() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lists/${params.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not rename");
      setData((current) => (current ? { ...current, name: body.name } : body));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename");
    } finally {
      setBusy(false);
    }
  }

  async function removeLead(leadId: string) {
    if (!data || removingId) return;
    setError(null);
    const previous = data;
    setData({ ...data, leads: data.leads.filter((lead) => lead.id !== leadId) });
    setRemovingId(leadId);
    try {
      const res = await fetch(`/api/lists/${params.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ removeLeadId: leadId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not remove");
    } catch (err) {
      setData(previous);
      setError(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setRemovingId(null);
    }
  }

  function deleteThis() {
    if (!data) return;
    scheduleDelete({ kind: "list", id: params.id, name: data.name });
    router.replace("/lists");
  }

  async function exportCrm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lists/${params.id}/export`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "export failed");
      setExportResult(`${body.contacts?.length ?? 0} contacts → ${body.destination} (not sent)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "export failed");
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

  return (
    <AppShell>
      <BackLink href="/lists" label="People" />
      <input
        aria-label="List name"
        className="mt-3 w-full min-w-0 rounded border border-(--line) bg-(--input) px-3 py-2 text-3xl leading-normal"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !name.trim() || name.trim() === data.name}
          onClick={() => void saveName()}
          className="btn-primary rounded-md px-4 py-2 disabled:opacity-40"
        >
          Save name
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={deleteThis}
          className="btn-danger rounded-md px-4 py-2 disabled:opacity-40"
        >
          Delete list
        </button>
      </div>
      <p className="mt-2 text-sm text-(--muted)">
        LinkedIn profile URLs. Name, title, and company come from the LinkedIn profile. Export does
        not send messages.
      </p>
      <div className="mt-4">
        <button
          type="button"
          onClick={() => void exportCrm()}
          disabled={busy}
          className="rounded-md border border-(--line) px-4 py-2"
        >
          {busy ? "Exporting…" : "Export to CRM"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-(--danger)">{error}</p> : null}
      {exportResult ? <p className="mt-3 text-sm text-(--muted)">{exportResult}</p> : null}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-(--line) text-(--muted)">
              <th className="py-2 pr-4">Name</th>
              <th className="pr-4">Title</th>
              <th className="pr-4">Company</th>
              <th className="pr-4">LinkedIn</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.leads.map((lead) => (
              <tr key={lead.id} className="border-b border-(--line)">
                <td className="py-2 pr-4">{lead.fullName || "—"}</td>
                <td className="pr-4">{lead.title || "—"}</td>
                <td className="pr-4">{lead.company || "—"}</td>
                <td className="truncate pr-4">
                  {lead.linkedinUrlNormalized ?? lead.linkedinUrl ?? "—"}
                </td>
                <td>
                  <button
                    type="button"
                    disabled={removingId === lead.id}
                    className="text-sm text-(--muted) underline disabled:opacity-40"
                    onClick={() => void removeLead(lead.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
