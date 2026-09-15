"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";

type Lead = {
  fullName: string;
  email: string | null;
  linkedinUrl: string | null;
  linkedinUrlNormalized?: string | null;
};

type Msg = {
  id: string;
  channel: string;
  direction: string;
  body: string;
  subject: string | null;
  enrollmentId: string;
  createdAt: string;
  enrollmentStatus?: string | null;
  lead: Lead | null;
};

type Thread = {
  enrollmentId: string;
  leadName: string;
  lead: Lead | null;
  enrollmentStatus: string | null;
  messages: Msg[];
};

export default function InboxPage() {
  const [rows, setRows] = useState<Msg[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/inbox");
    setRows(await res.json());
  }

  useEffect(() => {
    void refresh();
  }, []);

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

  const active = threads.find((t) => t.enrollmentId === openId) ?? threads[0] ?? null;

  useEffect(() => {
    if (!active) return;
    const last = [...active.messages].reverse()[0];
    const hasEmail = Boolean(active.lead?.email);
    const hasLi = Boolean(active.lead?.linkedinUrlNormalized ?? active.lead?.linkedinUrl);
    if (last?.channel === "email" && hasEmail) setChannel("email");
    else if (hasLi) setChannel("linkedin");
    else if (hasEmail) setChannel("email");
  }, [active?.enrollmentId]);

  async function stop(enrollmentId: string) {
    await fetch("/api/inbox/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enrollmentId }),
    });
    await refresh();
  }

  async function reply() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enrollmentId: active.enrollmentId, body: draft, channel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "reply failed");
      setDraft("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "reply failed");
    } finally {
      setBusy(false);
    }
  }

  const canLinkedIn = Boolean(active?.lead?.linkedinUrlNormalized ?? active?.lead?.linkedinUrl);
  const canEmail = Boolean(active?.lead?.email);

  return (
    <AppShell>
      <h1 className="text-3xl">Inbox</h1>
      <p className="mt-2 max-w-2xl text-(--muted)">
        Replies land here and stop that person in the sequence. You can write back without starting
        another campaign.
      </p>
      {threads.length === 0 ? (
        <p className="mt-6 text-(--muted)">No messages yet. Start a sequence first.</p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-[16rem_1fr]">
          <ul className="space-y-1">
            {threads.map((thread) => {
              const last = thread.messages[thread.messages.length - 1];
              return (
                <li key={thread.enrollmentId}>
                  <button
                    type="button"
                    className={`w-full rounded border px-3 py-2 text-left ${
                      active?.enrollmentId === thread.enrollmentId
                        ? "border-(--ink) bg-(--panel)"
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
            <section className="rounded-lg border border-(--line) bg-(--panel) p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl">{active.leadName}</h2>
                  {active.enrollmentStatus ? (
                    <p className="text-sm text-(--muted)">{active.enrollmentStatus}</p>
                  ) : null}
                </div>
                <button type="button" className="underline text-sm" onClick={() => void stop(active.enrollmentId)}>
                  Stop lead
                </button>
              </div>
              <ol className="mt-4 space-y-3">
                {active.messages.map((m) => (
                  <li key={m.id} className="rounded border border-(--line) bg-(--input) p-3">
                    <p className="text-sm text-(--muted)">
                      {m.direction} · {m.channel} · {m.createdAt}
                    </p>
                    {m.subject ? <p className="mt-1 text-sm">{m.subject}</p> : null}
                    <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-4 border-t border-(--line) pt-4">
                <div className="flex flex-wrap gap-2">
                  {canLinkedIn ? (
                    <button
                      type="button"
                      className={`rounded-full border px-3 py-1 text-sm ${
                        channel === "linkedin" ? "border-(--ink) bg-(--ink) text-(--panel)" : "border-(--line)"
                      }`}
                      onClick={() => setChannel("linkedin")}
                    >
                      LinkedIn
                    </button>
                  ) : null}
                  {canEmail ? (
                    <button
                      type="button"
                      className={`rounded-full border px-3 py-1 text-sm ${
                        channel === "email" ? "border-(--ink) bg-(--ink) text-(--panel)" : "border-(--line)"
                      }`}
                      onClick={() => setChannel("email")}
                    >
                      Email
                    </button>
                  ) : null}
                </div>
                <textarea
                  className="mt-3 h-24 w-full rounded border border-(--line) bg-(--input) p-3 text-sm"
                  placeholder="Reply…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy || !draft.trim() || (!canLinkedIn && !canEmail)}
                  onClick={() => void reply()}
                  className="mt-3 rounded-md bg-(--ink) px-4 py-2 text-(--panel) disabled:opacity-40"
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
