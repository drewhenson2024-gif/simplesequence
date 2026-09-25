"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell, PageHeader } from "@/components/AppShell";
import { scheduleDelete, subscribePendingDelete } from "@/lib/client/pendingDelete";

type SequencePlan = {
  id: string;
  name: string;
  stepCount: number;
};

export default function SequencesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SequencePlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const visible = (rows ?? []).filter((row) => !hiddenIds.has(row.id));

  useEffect(() => {
    return subscribePendingDelete(({ hidden, committed }) => {
      setHiddenIds(new Set(hidden.filter((item) => item.kind === "sequence").map((item) => item.id)));
      if (committed?.kind === "sequence") {
        setRows((current) => current?.filter((row) => row.id !== committed.id) ?? current);
      }
    });
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/sequences");
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not load sequences");
        setRows([]);
        return;
      }
      setRows(Array.isArray(body) ? body : []);
    })();
  }, []);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await fetch("/api/sequences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not create the sequence");
      return;
    }
    router.push(`/sequences/${data.id}`);
  }

  return (
    <AppShell>
      <PageHeader
        title="Sequences"
        lede="Actions and the delay between them. A sequence has no people and does not send. Pair it with a people list to make a campaign."
      />
      <div className="card mt-6 flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-64 flex-1">
          <label className="label">Sequence name</label>
          <input
            className="field mt-1.5"
            placeholder="Intro connection"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button type="button" disabled={!name.trim()} onClick={() => void create()} className="btn btn-primary">
          Create sequence
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-(--danger)">{error}</p> : null}
      <ul className="mt-6 space-y-2">
        {rows === null ? <li className="card px-4 py-3 text-sm text-(--muted)">Loading…</li> : null}
        {rows && visible.length === 0 ? (
          <li className="empty">No sequences yet. Name one above, then choose the actions and any delay.</li>
        ) : null}
        {visible.map((row) => (
          <li key={row.id} className="flex items-center gap-2">
            <Link
              href={`/sequences/${row.id}`}
              className="card card-link flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3"
            >
              <span className="truncate font-medium">{row.name}</span>
              <span className="shrink-0 text-sm text-(--muted)">
                {row.stepCount} {row.stepCount === 1 ? "action" : "actions"}
              </span>
            </Link>
            <button
              type="button"
              className="btn btn-sm btn-quiet-danger"
              onClick={() => scheduleDelete({ kind: "sequence", id: row.id, name: row.name })}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
