"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/Toggle";
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
      <h1 className="text-3xl">Sequences</h1>
      <p className="mt-2 max-w-2xl text-(--muted)">
        Create a draft, add LinkedIn profile URLs, then Start. Sequences are LinkedIn connection
        plus messages. Stats live on Analytics. Learnings write a new draft only.
      </p>
      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-(--line) bg-(--panel) p-4">
        <div>
          <label className="text-sm text-(--muted)">Name</label>
          <input
            className="mt-1 block rounded border border-(--line) bg-(--input) px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => void create()}
          className="btn-primary rounded-full px-4 py-2 disabled:opacity-40"
        >
          Create draft
        </button>
      </div>
      <ul className="mt-6 space-y-2">
        {!loaded ? (
          <li className="rounded-2xl border border-(--line) bg-(--panel) px-4 py-3 text-sm text-(--muted)">
            Loading…
          </li>
        ) : null}
        {loaded && visible.length === 0 ? (
          <li className="rounded-2xl border border-(--line) bg-(--panel) px-4 py-3 text-sm text-(--muted)">
            No sequences yet. Create a draft above.
          </li>
        ) : null}
        {error ? <li className="text-sm text-(--danger)">{error}</li> : null}
        {visible.map((c) => (
          <li key={c.id} className="flex items-stretch gap-2">
            <Link
              href={`/campaigns/${c.id}`}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl border border-(--line) bg-(--panel) px-4 py-3"
            >
              <span className="font-medium">{c.name}</span>
              <span className="flex shrink-0 items-center gap-3 text-sm text-(--muted)">
                <StatusBadge
                  tone={c.status === "running" ? "ok" : c.status === "paused" ? "wait" : "muted"}
                >
                  {c.status}
                </StatusBadge>
                {c.enrollmentCount} people
              </span>
            </Link>
            {c.status === "draft" ? (
              <button
                type="button"
                className="btn-danger shrink-0 rounded-2xl px-4 text-sm"
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
