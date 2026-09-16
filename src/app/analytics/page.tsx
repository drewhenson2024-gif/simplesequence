"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SoonBadge, StatusBadge } from "@/components/Toggle";
import { useAnalytics } from "@/lib/client/tabCaches";

function rateLabel(rate: number, sent: number) {
  if (sent === 0) return "—";
  return `${Math.round(rate * 100)}%`;
}

function statusTone(status: string): "ok" | "off" | "wait" | "danger" | "muted" {
  if (status === "running") return "ok";
  if (status === "restricted") return "danger";
  if (status === "paused") return "wait";
  if (status === "draft") return "muted";
  return "off";
}

export default function AnalyticsPage() {
  const { data, loaded, error: cacheError } = useAnalytics();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);

  useEffect(() => {
    if (cacheError) setError(cacheError);
  }, [cacheError]);

  useEffect(() => {
    if (!selectedId && data?.runs[0]) setSelectedId(data.runs[0].id);
  }, [data, selectedId]);

  const selected = useMemo(
    () => data?.runs.find((run) => run.id === selectedId) ?? null,
    [data, selectedId],
  );

  async function saveDraft() {
    if (!selected) return;
    setApplyBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${selected.id}/learnings/apply`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "could not save draft");
      window.location.href = `/campaigns/${body.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save draft");
      setApplyBusy(false);
    }
  }

  const totals = data?.totals;

  return (
    <AppShell>
      <h1 className="text-3xl">Analytics</h1>
      <p className="mt-2 max-w-2xl text-(--muted)">
        Stats for every run — what sent, what skipped, what replied. Suggestions come from those
        numbers. They never rewrite a live sequence and never auto-start.
      </p>

      {error ? <p className="mt-4 text-sm text-(--danger)">{error}</p> : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Runs", totals?.runs ?? 0],
          ["Enrolled", totals?.enrolled ?? 0],
          ["Sent", totals?.sent ?? 0],
          ["Skipped", totals?.skipped ?? 0],
          ["Failed", totals?.failed ?? 0],
          ["Replies", totals?.replies ?? 0],
          ["Reply rate", totals ? rateLabel(totals.replyRate, totals.sent) : "—"],
          ["Restricted", totals?.restricted ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-(--line) bg-(--panel) px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-(--muted)">{label}</p>
            <p className="mt-2 text-2xl">{loaded ? value : "…"}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="rounded-2xl border border-(--line) bg-(--panel) p-4">
          <h2 className="text-xl">Runs</h2>
          <p className="mt-1 text-sm text-(--muted)">Every sequence in this workspace.</p>
          {!loaded ? (
            <p className="mt-4 text-sm text-(--muted)">Loading…</p>
          ) : data?.runs.length ? (
            <ul className="mt-4 space-y-2">
              {data.runs.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(run.id)}
                    className={`w-full rounded-xl border px-4 py-3 text-left ${
                      run.id === selectedId
                        ? "border-(--ochre) bg-(--input)"
                        : "border-(--line) bg-(--input) hover:border-(--ochre)"
                    }`}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{run.name}</span>
                      <StatusBadge tone={statusTone(run.status)}>{run.status}</StatusBadge>
                    </span>
                    <span className="mt-2 block text-sm text-(--muted)">
                      {run.sent} sent · {run.replies} replies · {rateLabel(run.replyRate, run.sent)} ·{" "}
                      {run.skipped} skipped
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl border border-(--line) bg-(--input) px-4 py-3 text-sm text-(--muted)">
              No runs yet. Sequences you create will land here with zeros until something sends.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-(--line) bg-(--panel) p-4">
          {selected ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-(--muted)">Selected run</p>
                  <h2 className="mt-1 text-xl">{selected.name}</h2>
                </div>
                <Link href={`/campaigns/${selected.id}`} className="btn-primary rounded-2xl px-4 py-1.5 text-sm">
                  Open sequence
                </Link>
              </div>
              <p className="mt-2 text-sm text-(--muted)">
                {selected.enrolled} enrolled · {selected.pending} pending · last activity{" "}
                {selected.lastActivity ? selected.lastActivity.slice(0, 10) : "—"}
              </p>

              <div className="mt-4 overflow-auto rounded-xl border border-(--line)">
                <table className="w-full text-left text-sm">
                  <thead className="text-(--muted)">
                    <tr>
                      <th className="px-3 py-2 font-medium">Step</th>
                      <th className="px-3 py-2 font-medium">Sent</th>
                      <th className="px-3 py-2 font-medium">Skipped</th>
                      <th className="px-3 py-2 font-medium">Failed</th>
                      <th className="px-3 py-2 font-medium">Replies</th>
                      <th className="px-3 py-2 font-medium">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.steps.length ? (
                      selected.steps.map((step) => (
                        <tr key={step.stepIndex} className="border-t border-(--line)">
                          <td className="px-3 py-2">
                            {step.stepIndex + 1}. {step.action}
                            <span className="mt-0.5 block text-xs text-(--muted)">{step.channel}</span>
                          </td>
                          <td className="px-3 py-2">{step.sent}</td>
                          <td className="px-3 py-2">
                            {step.skipped}
                            {Object.keys(step.skipReasons).length ? (
                              <span className="mt-0.5 block text-xs text-(--muted)">
                                {Object.entries(step.skipReasons)
                                  .map(([reason, n]) => `${reason} (${n})`)
                                  .join(" · ")}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{step.failed}</td>
                          <td className="px-3 py-2">{step.replies}</td>
                          <td className="px-3 py-2">{rateLabel(step.replyRate, step.sent)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-t border-(--line)">
                        <td className="px-3 py-3 text-(--muted)" colSpan={6}>
                          This run has no steps yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4">
                <h3 className="text-sm font-medium">What worked / what didn’t</h3>
                <ul className="mt-2 space-y-2">
                  {selected.insights.map((line) => (
                    <li key={line} className="rounded-xl border border-(--line) bg-(--input) px-4 py-3 text-sm">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 rounded-xl border border-(--line) bg-(--input) p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">Suggestions</h3>
                </div>
                <p className="mt-2 text-sm text-(--muted)">
                  Rule-based from the numbers on this run. Applying writes a new draft only.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={applyBusy}
                    className="btn-primary rounded-full px-4 py-2 text-sm"
                    onClick={() => void saveDraft()}
                  >
                    {applyBusy ? "Saving draft…" : "Save as new draft"}
                  </button>
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-2 rounded-full border border-(--line) px-4 py-2 text-sm text-(--muted)"
                  >
                    AI draft from these stats
                    <SoonBadge />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-(--muted)">
              {loaded
                ? "Select a run to see step breakdown, skip reasons, and suggestions."
                : "Loading…"}
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
