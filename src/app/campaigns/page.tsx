"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatusBadge } from "@/components/Toggle";
import { statusLabel } from "@/lib/ui/display";
import { scheduleDelete, subscribePendingDelete } from "@/lib/client/pendingDelete";
import { usePeopleLists } from "@/lib/client/peopleCache";
import { upsertSequence, useSequences } from "@/lib/client/sequencesCache";

function CampaignsPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { sequences, loaded, error } = useSequences();
  const { lists, loaded: listsLoaded } = usePeopleLists();
  const [plans, setPlans] = useState<Array<{ id: string; name: string; stepCount: number }>>([]);
  const [sequenceId, setSequenceId] = useState(search.get("sequence") ?? "");
  const [listId, setListId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const visible = sequences.filter((row) => !hiddenIds.has(row.id));

  useEffect(() => {
    return subscribePendingDelete(({ hidden }) => {
      setHiddenIds(new Set(hidden.filter((item) => item.kind === "campaign").map((item) => item.id)));
    });
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/sequences");
      const body = await res.json();
      if (!res.ok || !Array.isArray(body)) return;
      setPlans(body);
      setSequenceId((current) => current || search.get("sequence") || body[0]?.id || "");
    })();
  }, [search]);

  useEffect(() => {
    if (!listId && lists[0]) setListId(lists[0].id);
  }, [lists, listId]);

  async function create() {
    if (!sequenceId || !listId) return;
    setCreateError(null);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sequenceId, listId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCreateError(typeof data.error === "string" ? data.error : "Could not create the campaign");
      return;
    }
    upsertSequence({
      id: data.id,
      name: data.name,
      status: data.status ?? "draft",
      enrollmentCount: Array.isArray(data.enrollments) ? data.enrollments.length : 0,
    });
    router.push(`/campaigns/${data.id}`);
  }

  return (
    <AppShell>
      <PageHeader
        title="Campaigns"
        lede="A campaign is one sequence plus one people list. Start is here. The campaign keeps those actions, so editing the sequence later does not change it."
      />
      <div className="card mt-6 flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-56 flex-1">
          <label className="label">Sequence</label>
          <select
            className="field mt-1.5"
            value={sequenceId}
            onChange={(e) => setSequenceId(e.target.value)}
          >
            {plans.length === 0 ? <option value="">No sequences yet</option> : null}
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} · {plan.stepCount} {plan.stepCount === 1 ? "action" : "actions"}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-56 flex-1">
          <label className="label">People list</label>
          <select className="field mt-1.5" value={listId} onChange={(e) => setListId(e.target.value)}>
            {listsLoaded && lists.length === 0 ? <option value="">No people lists yet</option> : null}
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name} · {list.leadCount} {list.leadCount === 1 ? "person" : "people"}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!sequenceId || !listId}
          onClick={() => void create()}
          className="btn btn-primary"
        >
          Create campaign
        </button>
      </div>
      {createError ? <p className="mt-3 text-sm text-(--danger)">{createError}</p> : null}
      {plans.length === 0 ? (
        <p className="mt-3 text-sm text-(--muted)">
          <Link href="/sequences" className="text-(--ochre) hover:underline">
            Build a sequence
          </Link>{" "}
          first. A sequence is the actions and the delay between them.
        </p>
      ) : null}
      <ul className="mt-6 space-y-2">
        {!loaded ? (
          <li className="card px-4 py-3 text-sm text-(--muted)">Loading…</li>
        ) : null}
        {loaded && visible.length === 0 ? (
          <li className="empty">No campaigns yet. Pair a sequence with a people list above.</li>
        ) : null}
        {error ? <li className="text-sm text-(--danger)">{error}</li> : null}
        {visible.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <Link
              href={`/campaigns/${c.id}`}
              className="card card-link flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3"
            >
              <span className="truncate font-medium">{c.name}</span>
              <span className="flex shrink-0 items-center gap-3 text-sm text-(--muted)">
                <StatusBadge
                  tone={
                    c.status === "running"
                      ? "ok"
                      : c.status === "restricted"
                        ? "danger"
                        : c.status === "paused"
                          ? "wait"
                          : "muted"
                  }
                >
                  {statusLabel(c.status)}
                </StatusBadge>
                {c.enrollmentCount} people
              </span>
            </Link>
            {c.status === "draft" ? (
              <button
                type="button"
                className="btn btn-sm btn-quiet-danger"
                onClick={() => scheduleDelete({ kind: "campaign", id: c.id, name: c.name })}
              >
                Delete
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={<AppShell><p className="text-sm text-(--muted)">Loading…</p></AppShell>}>
      <CampaignsPageInner />
    </Suspense>
  );
}
