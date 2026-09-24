"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatusBadge } from "@/components/Toggle";
import { statusLabel } from "@/lib/ui/display";
import { scheduleDelete, subscribePendingDelete } from "@/lib/client/pendingDelete";
import { upsertSequence, useSequences } from "@/lib/client/sequencesCache";

export default function CampaignsPage() {
  const router = useRouter();
  const { sequences, loaded, error } = useSequences();
  const [name, setName] = useState("");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const visible = sequences.filter((row) => !hiddenIds.has(row.id));

  useEffect(() => {
    return subscribePendingDelete(({ hidden }) => {
      setHiddenIds(new Set(hidden.filter((item) => item.kind === "campaign").map((item) => item.id)));
    });
  }, []);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed, templateKey: "linkedin_only" }),
    });
    const data = await res.json();
    if (!res.ok) return;
    upsertSequence({ id: data.id, name: trimmed, status: data.status ?? "draft", enrollmentCount: 0 });
    router.push(`/campaigns/${data.id}`);
  }

  return (
    <AppShell>
      <PageHeader
        title="Sequences"
        lede="Create a draft, add people, then press Start. A sequence is a LinkedIn connection followed by messages. Stats stay on Analytics, and suggestions save as a new draft."
      />
      <div className="card mt-6 flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-64 flex-1">
          <label className="label">Sequence name</label>
          <input
            className="field mt-1.5"
            placeholder="Restaurant ops outreach"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => void create()}
          className="btn btn-primary"
        >
          Create draft
        </button>
      </div>
      <ul className="mt-6 space-y-2">
        {!loaded ? (
          <li className="card px-4 py-3 text-sm text-(--muted)">Loading…</li>
        ) : null}
        {loaded && visible.length === 0 ? (
          <li className="empty">No sequences yet. Name one above to start a draft.</li>
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
