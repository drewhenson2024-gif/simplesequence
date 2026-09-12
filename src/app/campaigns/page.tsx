"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

type Campaign = { id: string; name: string; status: string; enrollmentCount: number };

export default function CampaignsPage() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [name, setName] = useState("Mixed sequence");
  const [templateKey, setTemplateKey] = useState("mixed");

  async function refresh() {
    const res = await fetch("/api/campaigns");
    setRows(await res.json());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function create() {
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, templateKey }),
    });
    const data = await res.json();
    window.location.href = `/campaigns/${data.id}`;
  }

  return (
    <AppShell>
      <h1 className="text-3xl">Campaigns</h1>
      <p className="mt-2 text-(--muted)">Creates are always draft. Sending is a separate start.</p>
      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-(--line) bg-(--panel) p-4">
        <div>
          <label className="text-sm text-(--muted)">Name</label>
          <input
            className="mt-1 block rounded border border-(--line) bg-white px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm text-(--muted)">Template</label>
          <select
            className="mt-1 block rounded border border-(--line) bg-white px-3 py-2"
            value={templateKey}
            onChange={(e) => setTemplateKey(e.target.value)}
          >
            <option value="mixed">Mixed LinkedIn + email</option>
            <option value="linkedin_only">LinkedIn only</option>
            <option value="email_only">Email only</option>
          </select>
        </div>
        <button type="button" onClick={() => void create()} className="rounded-md bg-(--ink) px-4 py-2 text-(--panel)">
          Create draft
        </button>
      </div>
      <ul className="mt-6 space-y-2">
        {rows.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded border border-(--line) bg-(--panel) px-4 py-3">
            <Link href={`/campaigns/${c.id}`} className="font-medium">
              {c.name}
            </Link>
            <span className="text-sm text-(--muted)">
              {c.status} · {c.enrollmentCount} leads
            </span>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
