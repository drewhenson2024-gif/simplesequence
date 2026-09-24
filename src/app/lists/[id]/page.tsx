"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell, BackLink } from "@/components/AppShell";
import { scheduleDelete } from "@/lib/client/pendingDelete";
import { patchPeopleList, refreshPeopleList, usePeopleList, type PeopleLead } from "@/lib/client/peopleCache";

export default function ListDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { list, loaded, error: cacheError } = usePeopleList(params.id);
  const [data, setData] = useState<{ name: string; leads: PeopleLead[] } | null>(
    list ? { name: list.name, leads: list.leads } : null,
  );
  const [name, setName] = useState(list?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<string | null>(null);

  useEffect(() => {
    if (!list) {
      if (loaded) setData(null);
      return;
    }
    setData({ name: list.name, leads: list.leads });
    setName(list.name);
    if (list.leadCount > 0 && list.leads.length === 0) {
      void refreshPeopleList(params.id).catch(() => undefined);
    }
  }, [list, loaded, params.id]);

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
      setData((current) => (current ? { ...current, name: body.name } : current));
      patchPeopleList(params.id, { name: body.name });
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
    const nextLeads = data.leads.filter((lead) => lead.id !== leadId);
    setData({ ...data, leads: nextLeads });
    patchPeopleList(params.id, { leads: nextLeads });
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
      patchPeopleList(params.id, { leads: previous.leads });
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
      setExportResult(`${body.contacts?.length ?? 0} contacts ready for ${body.destination}. Nothing was sent.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "export failed");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded && !data) {
    return (
      <AppShell>
        <p>Loading…</p>
      </AppShell>
    );
  }

  if (loaded && !data) {
    return (
      <AppShell>
        <BackLink href="/lists" label="People" />
        <p className="mt-3 text-sm text-(--danger)">{cacheError ?? "List not found"}</p>
      </AppShell>
    );
  }

  if (!data) return null;

  return (
    <AppShell>
      <BackLink href="/lists" label="People" />
      <input
        aria-label="List name"
        className="mt-3 w-full min-w-0 rounded-md border border-(--line) bg-(--paper) px-3 py-2 text-2xl leading-normal"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !name.trim() || name.trim() === data.name}
          onClick={() => void saveName()}
          className="btn-primary rounded-2xl px-4 py-2 disabled:opacity-40"
        >
          Save name
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={deleteThis}
          className="btn-quiet-danger rounded-2xl px-4 py-2 disabled:opacity-40"
        >
          Delete list
        </button>
      </div>
      <p className="mt-2 text-sm text-(--muted)">
        Name, title, and company come from each LinkedIn profile. Export prepares contacts and does not send anything.
      </p>
      <div className="mt-4">
        <button
          type="button"
          onClick={() => void exportCrm()}
          disabled={busy}
          className="rounded-2xl border border-(--line) px-4 py-2"
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
                    className="text-sm text-(--danger) disabled:opacity-40"
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
