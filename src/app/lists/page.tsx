"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { scheduleDelete, subscribePendingDelete } from "@/lib/client/pendingDelete";
import { refreshPeopleList, usePeopleLists } from "@/lib/client/peopleCache";

function detectedUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /linkedin\.com\/in\//i.test(line));
}

export default function ListsPage() {
  const { lists, loaded, error: cacheError } = usePeopleLists();
  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const urls = useMemo(() => detectedUrls(content), [content]);
  const visible = lists.filter((list) => !hiddenIds.has(list.id));

  useEffect(() => {
    return subscribePendingDelete(({ hidden }) => {
      setHiddenIds(new Set(hidden.filter((row) => row.kind === "list").map((row) => row.id)));
    });
  }, []);

  async function onImport() {
    setError(null);
    setResult(null);
    const res = await fetch("/api/lists/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        listName: name.trim() || undefined,
        content,
        format: "auto",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not add those links");
      return;
    }
    const imported = data.counts?.imported ?? 0;
    const merged = data.counts?.merged ?? 0;
    setResult(
      merged
        ? `Added ${imported}, merged ${merged} into ${data.name}.`
        : `Added ${imported} to ${data.name}.`,
    );
    setContent("");
    try {
      await refreshPeopleList(data.listId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh list");
    }
  }

  return (
    <AppShell>
      <h1 className="text-2xl tracking-tight">People</h1>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-(--muted)">
        Paste LinkedIn profile URLs. We fill in name, title, company, headline, location, and about from each profile.
      </p>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-(--line) bg-(--panel) p-5">
          <h2 className="text-lg">Add people</h2>
          <p className="mt-1 text-sm text-(--muted)">
            One LinkedIn profile URL per line. Duplicates are skipped.
          </p>
          <label className="mt-4 block text-sm text-(--muted)">List name</label>
          <input
            className="mt-1 w-full rounded-lg border border-(--line) bg-(--input) px-3 py-2"
            placeholder="Optional — we’ll name it if you leave this blank"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="mt-4 block text-sm text-(--muted)">LinkedIn URLs</label>
          <textarea
            className="mt-1 h-48 w-full rounded-lg border border-(--line) bg-(--input) p-3 font-mono text-sm"
            placeholder={"https://www.linkedin.com/in/priya-rao\nhttps://www.linkedin.com/in/matt-cole"}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <p className="mt-2 text-sm text-(--muted)">
            {urls.length === 0
              ? "No profile URLs yet."
              : `${urls.length} profile URL${urls.length === 1 ? "" : "s"} ready to add.`}
          </p>
          <button
            type="button"
            onClick={() => void onImport()}
            disabled={!content.trim()}
            className="btn-primary mt-4 rounded-full px-4 py-2 disabled:opacity-40"
          >
            Add people
          </button>
          {error || cacheError ? (
            <p className="mt-3 text-sm text-(--danger)">{error ?? cacheError}</p>
          ) : null}
          {result ? <p className="mt-3 text-sm text-(--muted)">{result}</p> : null}
        </div>
        <div className="rounded-2xl border border-(--line) bg-(--panel) p-5">
          <h2 className="text-lg">Your lists</h2>
          {!loaded ? (
            <p className="mt-3 text-sm text-(--muted)">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-(--line) px-4 py-8 text-sm text-(--muted)">
              No lists yet. Paste profile URLs, then add them.
            </p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {visible.map((list) => (
              <li key={list.id} className="flex items-stretch gap-2">
                <Link
                  href={`/lists/${list.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl border border-(--line) bg-(--panel) px-4 py-3"
                >
                  <span className="font-medium">{list.name}</span>
                  <span className="shrink-0 text-sm text-(--muted)">{list.leadCount} people</span>
                </Link>
                <button
                  type="button"
                  className="btn-quiet-danger shrink-0 rounded-2xl px-4 text-sm"
                  onClick={() => scheduleDelete({ kind: "list", id: list.id, name: list.name })}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
