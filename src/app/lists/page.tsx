"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

type ListRow = { id: string; name: string; leadCount: number };

function detectedUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /linkedin\.com\/in\//i.test(line));
}

export default function ListsPage() {
  const [lists, setLists] = useState<ListRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urls = useMemo(() => detectedUrls(content), [content]);

  async function refresh() {
    const res = await fetch("/api/lists");
    setLists(await res.json());
    setLoaded(true);
  }

  useEffect(() => {
    void refresh();
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
    await refresh();
  }

  return (
    <AppShell>
      <h1 className="text-3xl">People</h1>
      <p className="mt-2 max-w-2xl text-(--muted)">
        Paste LinkedIn profile URLs. We look up name, title, company, headline, location, and about
        from each profile. Agents send the same links over MCP. We do not search or build lists for you.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-(--line) bg-(--panel) p-4">
          <h2 className="text-lg">Add links</h2>
          <p className="mt-1 text-sm text-(--muted)">
            One LinkedIn profile URL per line. Dedupes on the URL.
          </p>
          <label className="mt-3 block text-sm text-(--muted)">List name (optional)</label>
          <input
            className="mt-1 w-full rounded border border-(--line) bg-(--input) px-3 py-2"
            placeholder="Imported list"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="mt-4 block text-sm text-(--muted)">LinkedIn URLs</label>
          <textarea
            className="mt-1 h-48 w-full rounded border border-(--line) bg-(--input) p-3 font-mono text-sm"
            placeholder={"https://www.linkedin.com/in/priya-rao\nhttps://www.linkedin.com/in/matt-cole"}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void onImport()}
            disabled={!content.trim()}
            className="mt-4 rounded-full bg-(--ink) px-4 py-2 text-(--panel) disabled:opacity-40"
          >
            Add links
          </button>
          {error ? <p className="mt-3 text-sm text-(--danger)">{error}</p> : null}
          {result ? <p className="mt-3 text-sm text-(--muted)">{result}</p> : null}
        </div>
        <div>
          <h2 className="text-lg">Detected</h2>
          <p className="mt-2 text-sm text-(--muted)">
            {urls.length === 0 ? "No LinkedIn profile URLs yet." : `${urls.length} profile URL${urls.length === 1 ? "" : "s"}`}
          </p>
          {urls.length > 0 ? (
            <ul className="mt-2 max-h-48 overflow-auto rounded-2xl border border-(--line) bg-(--panel) p-3 text-xs">
              {urls.slice(0, 20).map((url) => (
                <li key={url} className="truncate">
                  {url}
                </li>
              ))}
            </ul>
          ) : null}
          <h2 className="mt-6 text-lg">Your lists</h2>
          {!loaded ? (
            <p className="mt-2 text-sm text-(--muted)">Loading…</p>
          ) : lists.length === 0 ? (
            <p className="mt-2 text-sm text-(--muted)">No people yet. Paste LinkedIn profile URLs.</p>
          ) : null}
          <ul className="mt-2 space-y-2">
            {lists.map((list) => (
              <li key={list.id} className="rounded-2xl border border-(--line) bg-(--panel) px-3 py-2">
                <Link href={`/lists/${list.id}`} className="font-medium">
                  {list.name}
                </Link>
                <span className="ml-2 text-sm text-(--muted)">{list.leadCount} people</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
