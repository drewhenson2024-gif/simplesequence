"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

type ListRow = { id: string; name: string; leadCount: number };

export default function ListsPage() {
  const [lists, setLists] = useState<ListRow[]>([]);
  const [content, setContent] = useState(
    "first_name,last_name,company,title,email,linkedin_url,opening_line\nAda,Lovelace,Analytical Engines,Countess,ada@example.com,https://www.linkedin.com/in/ada-lovelace,Saw your note on difference engines\n",
  );
  const [name, setName] = useState("Codex list");
  const [result, setResult] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[]>([]);

  async function refresh() {
    const res = await fetch("/api/lists");
    setLists(await res.json());
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    setPreview(content.split(/\r?\n/).slice(0, 11));
  }, [content]);

  async function onImport() {
    const res = await fetch("/api/lists/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listName: name, content, format: "auto" }),
    });
    const data = await res.json();
    setResult(JSON.stringify(data, null, 2));
    await refresh();
  }

  return (
    <AppShell>
      <h1 className="text-3xl">Lists</h1>
      <p className="mt-2 text-(--muted)">Paste CSV or Markdown. Required: LinkedIn URL or email.</p>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-(--line) bg-(--panel) p-4">
          <label className="text-sm text-(--muted)">List name</label>
          <input
            className="mt-1 w-full rounded border border-(--line) bg-white px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="mt-4 block text-sm text-(--muted)">Paste</label>
          <textarea
            className="mt-1 h-48 w-full rounded border border-(--line) bg-white p-3 font-mono text-sm"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <input
            type="file"
            accept=".csv,.md,.txt"
            className="mt-3 text-sm"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setContent(await file.text());
            }}
          />
          <button
            type="button"
            onClick={() => void onImport()}
            className="mt-4 rounded-md bg-(--ink) px-4 py-2 text-(--panel)"
          >
            Import
          </button>
          {result ? <pre className="mt-4 overflow-auto text-xs">{result}</pre> : null}
        </div>
        <div>
          <h2 className="text-lg">Preview (first 10 rows)</h2>
          <pre className="mt-2 overflow-auto rounded border border-(--line) bg-(--panel) p-3 text-xs">
            {preview.join("\n")}
          </pre>
          <h2 className="mt-6 text-lg">Imported</h2>
          <ul className="mt-2 space-y-2">
            {lists.map((list) => (
              <li key={list.id} className="rounded border border-(--line) bg-(--panel) px-3 py-2">
                <Link href={`/lists/${list.id}`} className="font-medium">
                  {list.name}
                </Link>
                <span className="ml-2 text-sm text-(--muted)">{list.leadCount} leads</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
