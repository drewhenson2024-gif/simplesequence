"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useInbox, type InboxMessage } from "@/lib/client/tabCaches";
import { formatWhen, statusLabel } from "@/lib/ui/display";

type Lead = {
  fullName: string;
  email: string | null;
  linkedinUrl: string | null;
  linkedinUrlNormalized?: string | null;
};

type Msg = InboxMessage;

type Thread = {
  enrollmentId: string;
  leadName: string;
  lead: Lead | null;
  enrollmentStatus: string | null;
  messages: Msg[];
};

export default function InboxPage() {
  const { data: cachedRows, loaded, error: cacheError, set: setInbox } = useInbox();
  const rows = cachedRows ?? [];
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "needs_reply" | "waiting" | "stopped">("all");

  const threads: Thread[] = useMemo(() => {
    const by = new Map<string, Thread>();
    for (const msg of rows) {
      const existing = by.get(msg.enrollmentId);
      if (existing) {
        existing.messages.push(msg);
        continue;
      }
      by.set(msg.enrollmentId, {
        enrollmentId: msg.enrollmentId,
        leadName: msg.lead?.fullName ?? "Unknown",
        lead: msg.lead,
        enrollmentStatus: msg.enrollmentStatus ?? null,
        messages: [msg],
      });
    }
    return [...by.values()].map((thread) => ({
      ...thread,
      messages: [...thread.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));
  }, [rows]);

  useEffect(() => {
    if (!openId && threads[0]) setOpenId(threads[0].enrollmentId);
  }, [threads, openId]);

  function bucket(thread: Thread): "needs_reply" | "waiting" | "stopped" {
    if (thread.enrollmentStatus === "stopped" || thread.enrollmentStatus === "replied") return "stopped";
    const last = thread.messages[thread.messages.length - 1];
    if (last?.direction === "inbound") return "needs_reply";
    return "waiting";
  }

  const visible = threads.filter((thread) => filter === "all" || bucket(thread) === filter);
  const active = visible.find((t) => t.enrollmentId === openId) ?? visible[0] ?? null;

  async function stop(enrollmentId: string) {
    setInbox(
      rows.map((msg) => (msg.enrollmentId === enrollmentId ? { ...msg, enrollmentStatus: "stopped" } : msg)),
    );
    const res = await fetch("/api/inbox/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enrollmentId }),
    });
    if (!res.ok) {
      const resInbox = await fetch("/api/inbox");
      setInbox(await resInbox.json());
    }
  }

  async function reply() {
    if (!active) return;
    setBusy(true);
    setError(null);
    const text = draft;
    try {
      const res = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enrollmentId: active.enrollmentId, body: text, channel: "linkedin" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "reply failed");
      setDraft("");
      setInbox([
        {
          id: data.id ?? `local_${Date.now()}`,
          channel: "linkedin",
          direction: "outbound",
          body: text,
          subject: null,
          enrollmentId: active.enrollmentId,
          createdAt: data.createdAt ?? new Date().toISOString(),
          enrollmentStatus: active.enrollmentStatus,
          lead: active.lead,
        },
        ...rows,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "reply failed");
    } finally {
      setBusy(false);
    }
  }

  const canLinkedIn = Boolean(active?.lead?.linkedinUrlNormalized ?? active?.lead?.linkedinUrl);

  return (
    <AppShell>
      <h1 className="text-2xl tracking-tight">Inbox</h1>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-(--muted)">
        LinkedIn replies land here. A reply from this page does not start another sequence. Stop ends that person in the sequence.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["needs_reply", "Needs reply"],
            ["waiting", "Waiting on them"],
            ["stopped", "Stopped"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === key ? "border-(--ochre) bg-(--ochre) text-white" : "border-(--line)"
            }`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {error || cacheError ? <p className="mt-4 text-sm text-(--danger)">{error ?? cacheError}</p> : null}
      {!loaded ? (
        <p className="mt-6 text-sm text-(--muted)">Loading…</p>
      ) : threads.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-(--line) px-4 py-10 text-sm text-(--muted)">
          No conversations yet. Replies show up here after a sequence sends.
        </p>
      ) : visible.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-(--line) px-4 py-10 text-sm text-(--muted)">
          Nothing in this view.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-[16rem_1fr]">
          <ul className="space-y-1">
            {visible.map((thread) => {
              const last = thread.messages[thread.messages.length - 1];
              return (
                <li key={thread.enrollmentId}>
                  <button
                    type="button"
                    className={`w-full rounded-xl border px-3 py-2 text-left ${
                      active?.enrollmentId === thread.enrollmentId
                        ? "border-(--ochre) bg-(--panel)"
                        : "border-(--line) bg-(--panel)"
                    }`}
                    onClick={() => setOpenId(thread.enrollmentId)}
                  >
                    <p className="font-medium">{thread.leadName}</p>
                    <p className="truncate text-sm text-(--muted)">{last?.body}</p>
                  </button>
                </li>
              );
            })}
          </ul>
          {active ? (
            <section className="rounded-2xl border border-(--line) bg-(--panel) p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl">{active.leadName}</h2>
                  {active.enrollmentStatus ? (
                    <p className="text-sm text-(--muted)">{statusLabel(active.enrollmentStatus)}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn-quiet-danger rounded-full px-4 py-1.5 text-sm"
                  onClick={() => void stop(active.enrollmentId)}
                >
                  Stop
                </button>
              </div>
              <ol className="mt-4 space-y-3">
                {active.messages.map((m) => (
                  <li key={m.id} className="rounded-xl border border-(--line) bg-(--input) p-3">
                    <p className="text-sm text-(--muted)">
                      {m.direction === "inbound" ? "Them" : "You"} · LinkedIn · {formatWhen(m.createdAt)}
                    </p>
                    {m.subject ? <p className="mt-1 text-sm">{m.subject}</p> : null}
                    <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-4 border-t border-(--line) pt-4">
                <textarea
                  className="mt-3 h-24 w-full rounded-lg border border-(--line) bg-(--input) p-3 text-sm"
                  placeholder="Reply on LinkedIn…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy || !draft.trim() || !canLinkedIn}
                  onClick={() => void reply()}
                  className="btn-primary mt-3 rounded-full px-4 py-2 disabled:opacity-40"
                >
                  {busy ? "Sending…" : "Reply"}
                </button>
                {error ? <p className="mt-2 text-sm text-(--danger)">{error}</p> : null}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
