"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/Toggle";
import { scheduleDelete, subscribePendingDelete } from "@/lib/client/pendingDelete";

type Campaign = { id: string; name: string; status: string; enrollmentCount: number };

export default function CampaignsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("LinkedIn sequence");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const visible = rows.filter((row) => !hiddenIds.has(row.id));

  useEffect(() => {
    return subscribePendingDelete(({ hidden, committed }) => {
      setHiddenIds(new Set(hidden.filter((item) => item.kind === "campaign").map((item) => item.id)));
      if (committed?.kind === "campaign") {
        setRows((current) => current.filter((row) => row.id !== committed.id));
      }
    });
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/campaigns");
      setRows(await res.json());
      setLoaded(true);
    })();
  }, []);

  async function create() {
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, templateKey: "linkedin_only" }),
    });
    const data = await res.json();
    if (!res.ok) return;
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
        <button type="button" onClick={() => void create()} className="btn-primary rounded-full px-4 py-2">
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
        {visible.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl border border-(--line) bg-(--panel) px-4 py-3">
            <Link href={`/campaigns/${c.id}`} className="min-w-0 font-medium">
              {c.name}
            </Link>
            <span className="flex shrink-0 items-center gap-3 text-sm text-(--muted)">
              <StatusBadge
                tone={c.status === "running" ? "ok" : c.status === "paused" ? "wait" : "muted"}
              >
                {c.status}
              </StatusBadge>
              {c.enrollmentCount} people
              {c.status === "draft" ? (
                <button
                  type="button"
                  className="underline"
                  onClick={() => scheduleDelete({ kind: "campaign", id: c.id, name: c.name })}
                >
                  Delete
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
