"use client";

import Link from "next/link";
import { SoonBadge, StatusBadge } from "@/components/Toggle";
import { formatWhen, statusLabel } from "@/lib/ui/display";
import { useAnalytics } from "@/lib/client/tabCaches";
import type { PreviewLead } from "@/components/SequenceEditor";

type Enrollment = {
  id: string;
  status: string;
  nextStepIndex: number;
  lead: PreviewLead | null;
};

type Job = {
  id: string;
  enrollmentId: string;
  stepIndex: number;
  status: string;
  dueAt: string;
  dryRun: number;
  error: string | null;
  skipReason: string | null;
  channel: string | null;
  action: string | null;
  lead: { fullName: string; email?: string | null } | null;
};

type Step = {
  stepIndex: number;
  channel: string;
  action: string;
  delayHours: number;
};

function count(rows: { status: string }[], ...statuses: string[]) {
  return rows.filter((row) => statuses.includes(row.status)).length;
}

function rateLabel(rate: number, sent: number) {
  if (sent === 0) return "—";
  return `${Math.round(rate * 100)}%`;
}

function dayLabel(steps: Step[], index: number) {
  const hours = steps.slice(0, index + 1).reduce((sum, step) => sum + step.delayHours, 0);
  return `Day ${Math.max(1, Math.floor(hours / 24) + 1)}`;
}

function stepTitle(action: string) {
  return action === "connection" ? "LinkedIn connection" : "LinkedIn message";
}

function jobTone(status: string): "ok" | "wait" | "danger" | "muted" {
  if (status === "sent") return "ok";
  if (status === "pending" || status === "claimed" || status === "in_progress") return "wait";
  if (status === "failed") return "danger";
  return "muted";
}

function skipLabel(reason: string | null) {
  if (!reason) return null;
  if (reason === "no linkedin url") return "No LinkedIn URL";
  if (reason === "not connected") return "Not connected";
  if (reason === "overdue") return "Overdue";
  if (reason === "disabled") return "Step disabled";
  if (reason === "gift removed") return "Gift stage removed";
  if (reason === "email removed") return "Email stage removed";
  if (reason === "invite limit") return "Invite limit — this one waits";
  return reason;
}

export function SequenceReport({
  campaignId,
  status,
  createdAt,
  senderSignal,
  accountBudget,
  steps,
  enrollments,
  enrollmentCounts,
  jobs,
  jobCounts,
  durationLabel,
  outboxFilter,
  onOutboxFilter,
  onStop,
}: {
  campaignId: string;
  status: string;
  createdAt?: string;
  senderSignal?: "throttled" | "restricted" | null;
  accountBudget?: {
    connectionsUsed: number;
    connectionCap: number;
    note: string | null;
  } | null;
  steps: Step[];
  enrollments: Enrollment[];
  enrollmentCounts: Record<string, number>;
  jobs: Job[];
  jobCounts: Record<string, number>;
  durationLabel: string;
  outboxFilter: "all" | "queued" | "sent" | "skipped" | "failed";
  onOutboxFilter: (next: "all" | "queued" | "sent" | "skipped" | "failed") => void;
  onStop: (enrollmentId: string) => void;
}) {
  const { data } = useAnalytics();
  const run = data?.runs.find((row) => row.id === campaignId) ?? null;
  const total = enrollments.length;
  const remaining = count(enrollments, "pending", "waiting", "in_progress");
  const completed = count(enrollments, "completed");
  const replied = count(enrollments, "replied");
  const failed = count(enrollments, "failed", "bounced");
  const stopped = count(enrollments, "stopped");

  function jobFilterMatch(jobStatus: string) {
    if (outboxFilter === "all") return true;
    if (outboxFilter === "queued") return jobStatus === "pending" || jobStatus === "claimed" || jobStatus === "in_progress";
    if (outboxFilter === "sent") return jobStatus === "sent";
    if (outboxFilter === "skipped") return jobStatus === "skipped" || jobStatus === "cancelled";
    return jobStatus === "failed";
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <section>
          <p className="text-xs uppercase tracking-wide text-(--muted)">People</p>
          <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-(--line) bg-(--line) sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Added", total],
              ["Remaining", remaining],
              ["Completed", completed],
              ["Replied", replied],
              ["Stopped", stopped],
              ["Failed", failed],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-(--paper) px-4 py-3">
                <p className="text-xs text-(--muted)">{label}</p>
                <p className="mt-1 text-xl">{value}</p>
              </div>
            ))}
          </div>
          {accountBudget ? (
            <div className="mt-3 grid gap-px overflow-hidden rounded-xl border border-(--line) bg-(--line) sm:grid-cols-[12rem_minmax(0,1fr)]">
              <div className="bg-(--paper) px-4 py-3">
                <p className="text-xs text-(--muted)">Connections</p>
                <p className="mt-1 text-xl">
                  {accountBudget.connectionsUsed} of {accountBudget.connectionCap}
                </p>
                <p className="mt-1 text-xs text-(--muted)">Last 24 hours</p>
              </div>
              <div className="bg-(--paper) px-4 py-3">
                <p className="text-xs text-(--muted)">Next step</p>
                <p className="mt-1">{accountBudget.note ?? "Nothing is waiting on the account."}</p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-8">
          <p className="text-xs uppercase tracking-wide text-(--muted)">Stage breakdown</p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-(--line)">
            <table className="w-full text-left text-sm">
              <thead className="text-(--muted)">
                <tr>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Day</th>
                  <th className="px-4 py-2 font-medium">Sent</th>
                  <th className="px-4 py-2 font-medium">Skipped</th>
                  <th className="px-4 py-2 font-medium">Replies</th>
                  <th className="px-4 py-2 font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {steps.length ? (
                  steps.map((step, index) => {
                    const stats = run?.steps.find((row) => row.stepIndex === step.stepIndex);
                    const sent = stats?.sent ?? jobs.filter((job) => job.stepIndex === step.stepIndex && job.status === "sent").length;
                    const skipped =
                      stats?.skipped ?? jobs.filter((job) => job.stepIndex === step.stepIndex && job.status === "skipped").length;
                    const replies = stats?.replies ?? 0;
                    return (
                      <tr key={step.stepIndex} className="border-t border-(--line)">
                        <td className="px-4 py-2">{index + 1}</td>
                        <td className="px-4 py-2">{stepTitle(step.action)}</td>
                        <td className="px-4 py-2">{dayLabel(steps, index)}</td>
                        <td className="px-4 py-2">{sent}</td>
                        <td className="px-4 py-2">{skipped}</td>
                        <td className="px-4 py-2">{replies}</td>
                        <td className="px-4 py-2">{rateLabel(stats?.replyRate ?? 0, sent)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-(--muted)" colSpan={7}>
                      No stages yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg">People in this sequence</h2>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-(--muted)">
            {Object.entries(enrollmentCounts).map(([key, n]) => (
              <span key={key}>
                {statusLabel(key)}: {n}
              </span>
            ))}
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-(--line)">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-(--muted)">
                  <th className="px-4 py-2 font-medium">Person</th>
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Next step</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {enrollments.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-(--muted)" colSpan={6}>
                      No people yet. Add a list on Stages.
                    </td>
                  </tr>
                ) : (
                  enrollments.map((row) => (
                    <tr key={row.id} className="border-t border-(--line)">
                      <td className="px-4 py-2">{row.lead?.fullName ?? row.id}</td>
                      <td className="px-4 py-2">{row.lead?.title || "—"}</td>
                      <td className="px-4 py-2">{row.lead?.company || "—"}</td>
                      <td className="px-4 py-2">{statusLabel(row.status)}</td>
                      <td className="px-4 py-2">{row.nextStepIndex + 1}</td>
                      <td className="px-4 py-2">
                        {row.status !== "stopped" && row.status !== "replied" && row.status !== "completed" ? (
                          <button type="button" className="text-sm text-(--danger)" onClick={() => onStop(row.id)}>
                            Stop
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg">Outbox</h2>
          <p className="mt-1 text-sm text-(--muted)">
            Queued, sent, or skipped for this sequence. A skip reason means that step was dropped and the
            sequence continues.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["all", "queued", "sent", "skipped", "failed"] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`rounded-full border px-3 py-1 text-sm ${
                  outboxFilter === key ? "border-(--ochre) bg-(--ochre) text-white" : "border-(--line)"
                }`}
                onClick={() => onOutboxFilter(key)}
              >
                {statusLabel(key)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-(--muted)">
            {Object.entries(jobCounts).map(([key, n]) => (
              <span key={key}>
                {statusLabel(key)}: {n}
              </span>
            ))}
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {jobs.length === 0 ? (
              <li className="rounded-xl border border-dashed border-(--line) px-4 py-6 text-(--muted)">
                Nothing queued yet. Start the sequence to line up sends.
              </li>
            ) : (
              jobs.filter((job) => jobFilterMatch(job.status)).map((job) => {
                const reason = skipLabel(job.skipReason ?? job.error);
                return (
                  <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-(--line) px-3 py-2">
                    <div>
                      <p>
                        {job.lead?.fullName ?? "Person"} · step {job.stepIndex + 1}
                        {job.action ? ` · ${stepTitle(job.action)}` : ""}
                      </p>
                      <p className="text-(--muted)">
                        {formatWhen(job.dueAt)}
                        {job.dryRun ? " · Sandbox" : ""}
                        {reason ? ` · ${reason}` : ""}
                      </p>
                    </div>
                    <span className="flex items-center gap-3">
                      <StatusBadge tone={jobTone(job.status)}>{statusLabel(job.status)}</StatusBadge>
                      {job.status === "pending" || job.status === "claimed" || job.status === "in_progress" ? (
                        <button type="button" className="text-sm text-(--danger)" onClick={() => onStop(job.enrollmentId)}>
                          Stop
                        </button>
                      ) : null}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-xl border border-(--line) p-4">
          <p className="text-xs uppercase tracking-wide text-(--muted)">Details</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-(--muted)">Status</dt>
              <dd>{statusLabel(status)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-(--muted)">Created</dt>
              <dd>{createdAt ? formatWhen(createdAt) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-(--muted)">People</dt>
              <dd>{total}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-(--muted)">Stages</dt>
              <dd>{steps.length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-(--muted)">Duration</dt>
              <dd>{durationLabel}</dd>
            </div>
            {senderSignal ? (
              <div className="flex justify-between gap-4">
                <dt className="text-(--muted)">Sender</dt>
                <dd>{statusLabel(senderSignal)}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="rounded-xl border border-(--line) p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wide text-(--muted)">Insights</p>
            <SoonBadge />
          </div>
          <p className="mt-2 text-sm text-(--muted)">
            Writing new copy from these stats is coming soon. The notes below come from the numbers on this sequence.
          </p>
          <ul className="mt-3 space-y-2">
            {(run?.insights ?? ["No sends yet. Start the sequence to fill this in."]).map((line) => (
              <li key={line} className="rounded-lg bg-(--input) px-3 py-2 text-sm">
                {line}
              </li>
            ))}
          </ul>
          <Link href={`/analytics`} className="mt-3 inline-block text-sm text-(--ochre)">
            Open Analytics
          </Link>
        </section>
      </aside>
    </div>
  );
}
