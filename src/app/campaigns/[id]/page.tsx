"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell, BackLink } from "@/components/AppShell";
import { SequenceEditor, type EditorStep, type PreviewLead } from "@/components/SequenceEditor";
import { StatusBadge } from "@/components/Toggle";
import { scheduleDelete } from "@/lib/client/pendingDelete";
import { usePeopleLists } from "@/lib/client/peopleCache";
import { refreshSequence, setSequenceDetail, useSequenceDetail } from "@/lib/client/sequencesCache";

type Campaign = {
  id: string;
  name: string;
  status: string;
  steps: Array<{
    stepIndex: number;
    channel: string;
    action: string;
    delayHours: number;
    bodyTemplate: string;
    subjectTemplate: string | null;
    enabled?: number;
    skipOverdueHours?: number;
    imageUrl?: string | null;
  }>;
  enrollments: Array<{
    id: string;
    status: string;
    nextStepIndex: number;
    lead: PreviewLead | null;
  }>;
  enrollmentCounts: Record<string, number>;
  jobCounts: Record<string, number>;
  jobs?: Array<{
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
  }>;
};

type OutboxFilter = "all" | "queued" | "sent" | "skipped" | "failed";

const ACTION_BTN = "rounded-2xl px-4 py-2";

function jobTone(status: string): "ok" | "wait" | "danger" | "muted" {
  if (status === "sent") return "ok";
  if (status === "pending" || status === "claimed" || status === "in_progress") return "wait";
  if (status === "failed") return "danger";
  return "muted";
}

function jobFilterMatch(status: string, filter: OutboxFilter) {
  if (filter === "all") return true;
  if (filter === "queued") return status === "pending" || status === "claimed" || status === "in_progress";
  if (filter === "sent") return status === "sent";
  if (filter === "skipped") return status === "skipped" || status === "cancelled";
  return status === "failed";
}

function skipLabel(reason: string | null) {
  if (!reason) return null;
  if (reason === "no linkedin url") return "No LinkedIn URL";
  if (reason === "not connected") return "Not connected";
  if (reason === "overdue") return "Overdue";
  if (reason === "disabled") return "Step disabled";
  if (reason === "gift removed") return "Gift stage removed";
  if (reason === "email removed") return "Email stage removed";
  return reason;
}

function toEditor(steps: Campaign["steps"]): EditorStep[] {
  return [...steps]
    .filter((step) => step.channel !== "gift" && step.action !== "gift" && step.channel !== "email" && step.action !== "email")
    .sort((a, b) => a.stepIndex - b.stepIndex)
    .map((step, index) => ({
      stepIndex: index,
      channel: "linkedin" as const,
      action: step.action === "connection" ? ("connection" as const) : ("message" as const),
      delayHours: step.delayHours,
      bodyTemplate: step.bodyTemplate,
      subjectTemplate: step.subjectTemplate,
      enabled: step.enabled !== 0,
      skipOverdueHours: step.skipOverdueHours ?? 72,
      imageUrl: step.imageUrl ?? null,
    }));
}

function blankStep(kind: "connection" | "message", index: number): EditorStep {
  if (kind === "connection") {
    return {
      stepIndex: index,
      channel: "linkedin",
      action: "connection",
      delayHours: index === 0 ? 0 : 24,
      bodyTemplate: "Hi {{first_name}} — {{title}} at {{company}}",
      subjectTemplate: null,
      enabled: true,
      skipOverdueHours: 72,
      imageUrl: null,
    };
  }
  return {
    stepIndex: index,
    channel: "linkedin",
    action: "message",
    delayHours: index === 0 ? 0 : 48,
    bodyTemplate: "Hi {{first_name}}, following up.",
    subjectTemplate: null,
    enabled: true,
    skipOverdueHours: 72,
    imageUrl: null,
  };
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { detail } = useSequenceDetail<Campaign>(params.id);
  const [data, setData] = useState<Campaign | null>(detail);
  const { lists } = usePeopleLists();
  const [listId, setListId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<EditorStep[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [outboxFilter, setOutboxFilter] = useState<OutboxFilter>("all");
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  function applyCampaign(body: Campaign, syncEditor = true) {
    setData(body);
    setSequenceDetail(body as Record<string, unknown> & { id: string });
    if (syncEditor) {
      setName(body.name);
      setSteps(toEditor(body.steps));
    }
  }

  useEffect(() => {
    if (detail) applyCampaign(detail, !dirtyRef.current);
  }, [detail]);

  useEffect(() => {
    if (!listId && lists[0]) setListId(lists[0].id);
  }, [lists, listId]);

  const leads: PreviewLead[] = useMemo(() => {
    return (data?.enrollments ?? [])
      .map((e) => e.lead)
      .filter((lead): lead is PreviewLead => Boolean(lead));
  }, [data]);

  const editable = data?.status === "draft";
  const durationHours = steps.reduce((sum, step) => sum + step.delayHours, 0);
  const durationLabel =
    durationHours >= 24 && durationHours % 24 === 0 ? `${durationHours / 24} days` : `${durationHours} hours`;

  async function save() {
    if (!editable) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${params.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        steps: steps.map((step, index) => ({ ...step, stepIndex: index })),
      }),
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(body.error);
      return;
    }
    setDirty(false);
    setData(body);
    setName(body.name);
    setSteps(toEditor(body.steps));
  }

  async function addLeads() {
    setError(null);
    const res = await fetch(`/api/campaigns/${params.id}/leads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listId }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error);
      return;
    }
    setDirty(false);
    if (body.campaign) applyCampaign(body.campaign, !dirtyRef.current);
  }

  async function start() {
    if (!window.confirm("Start sending? This is the explicit start action.")) return;
    if (dirty) await save();
    const res = await fetch(`/api/campaigns/${params.id}/start`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error);
      return;
    }
    applyCampaign(body);
  }

  async function pause() {
    const res = await fetch(`/api/campaigns/${params.id}/pause`, { method: "POST" });
    const body = await res.json();
    if (res.ok) applyCampaign(body);
  }

  function deleteDraft() {
    if (!data) return;
    scheduleDelete({ kind: "campaign", id: data.id, name: data.name });
    router.replace("/campaigns");
  }

  async function stopEnrollment(enrollmentId: string) {
    setError(null);
    setData((current) =>
      current
        ? {
            ...current,
            enrollments: current.enrollments.map((row) =>
              row.id === enrollmentId ? { ...row, status: "stopped" } : row,
            ),
          }
        : current,
    );
    const res = await fetch("/api/inbox/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enrollmentId }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error);
      const latest = (await refreshSequence(params.id)) as Campaign;
      applyCampaign(latest, !dirtyRef.current);
    }
  }

  if (!data) {
    return (
      <AppShell>
        <p>Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <BackLink href="/campaigns" label="Sequences" />
      <p className="mt-3">
        <StatusBadge
          tone={data.status === "running" ? "ok" : data.status === "paused" ? "wait" : "muted"}
        >
          {data.status}
        </StatusBadge>
      </p>
      {editable ? (
        <input
          className="mt-2 w-full min-w-0 rounded border border-(--line) bg-(--input) px-3 py-2 text-3xl leading-normal"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
        />
      ) : (
        <h1 className="mt-2 text-3xl leading-normal break-words">{data.name}</h1>
      )}
      <p className="mt-2 text-sm text-(--muted)">
        {steps.length} stages · {durationLabel} · {data.enrollments.length} leads
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {editable ? (
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void save()}
            className={`btn-primary ${ACTION_BTN} disabled:opacity-40`}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        ) : null}
        {data.status === "draft" || data.status === "paused" ? (
          <button type="button" onClick={() => void start()} className={`btn-primary ${ACTION_BTN}`}>
            Start
          </button>
        ) : null}
        {data.status === "running" ? (
          <button type="button" onClick={() => void pause()} className={`border border-(--line) ${ACTION_BTN}`}>
            Pause
          </button>
        ) : null}
        {data.status === "draft" ? (
          <button type="button" onClick={deleteDraft} className={`btn-danger ${ACTION_BTN}`}>
            Delete draft
          </button>
        ) : null}
      </div>

      {data.status === "draft" ? (
        <p className="mt-3 rounded border border-(--line) bg-(--panel) px-3 py-2 text-sm">
          This is a draft — nothing is sent until you hit Start.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-(--danger)">{error}</p> : null}

      <div className="mt-8">
        <SequenceEditor
          steps={steps}
          leads={leads}
          previewIndex={previewIndex}
          onPreviewIndex={setPreviewIndex}
          editable={editable}
          onChange={(next) => {
            setSteps(next);
            setDirty(true);
          }}
          onAdd={(index, kind) => {
            const next = [...steps];
            next.splice(index, 0, blankStep(kind, index));
            setSteps(next.map((step, i) => ({ ...step, stepIndex: i })));
            setDirty(true);
          }}
        />
      </div>

      <section className="mt-8 rounded-lg border border-(--line) bg-(--panel) p-4">
        <h2 className="text-xl">People in this sequence</h2>
        <p className="mt-1 text-sm text-(--muted)">
          Pick a list of LinkedIn URLs, then add those people here.
        </p>
        <div className="mt-3 flex gap-2">
          <select
            className="rounded border border-(--line) bg-(--input) px-3 py-2"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void addLeads()} className="rounded-2xl border border-(--line) px-4 py-2">
            Add from list
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-(--muted)">
          {Object.entries(data.enrollmentCounts).map(([status, n]) => (
            <span key={status}>
              {status}: {n}
            </span>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-(--muted)">
                <th className="py-1 pr-3">Person</th>
                <th className="pr-3">Title</th>
                <th className="pr-3">Company</th>
                <th className="pr-3">LinkedIn</th>
                <th className="pr-3">Status</th>
                <th className="pr-3">Next step</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.enrollments.map((e) => (
                <tr key={e.id} className="border-t border-(--line)">
                  <td className="py-2 pr-3">{e.lead?.fullName ?? e.id}</td>
                  <td className="pr-3">{e.lead?.title || "—"}</td>
                  <td className="pr-3">{e.lead?.company || "—"}</td>
                  <td className="max-w-64 truncate pr-3">{e.lead?.linkedinUrl ?? "—"}</td>
                  <td className="pr-3">{e.status}</td>
                  <td className="pr-3">{e.nextStepIndex + 1}</td>
                  <td>
                    {e.status !== "stopped" && e.status !== "replied" && e.status !== "completed" ? (
                      <button
                        type="button"
                        className="btn-danger rounded-2xl px-3 py-1 text-sm"
                        onClick={() => void stopEnrollment(e.id)}
                      >
                        Stop
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-(--line) bg-(--panel) p-4">
        <h2 className="text-xl">Outbox</h2>
        <p className="mt-1 text-sm text-(--muted)">
          Everything queued, sent, or skipped for this sequence. A skip reason means that step was
          dropped and the sequence continues.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["all", "queued", "sent", "skipped", "failed"] as OutboxFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`rounded-full border px-3 py-1 text-sm ${
                outboxFilter === key ? "border-(--ochre) bg-(--ochre) text-white" : "border-(--line)"
              }`}
              onClick={() => setOutboxFilter(key)}
            >
              {key}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-(--muted)">
          {Object.entries(data.jobCounts ?? {}).map(([status, n]) => (
            <span key={status}>
              {status}: {n}
            </span>
          ))}
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {(data.jobs ?? []).length === 0 ? (
            <p className="text-(--muted)">No jobs yet. Start the sequence to queue sends.</p>
          ) : null}
          {(data.jobs ?? [])
            .filter((job) => jobFilterMatch(job.status, outboxFilter))
            .map((job) => {
              const reason = skipLabel(job.skipReason ?? job.error);
              return (
                <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-(--line) px-3 py-2">
                  <div>
                    <p>
                      {job.lead?.fullName ?? "Lead"} · step {job.stepIndex + 1}
                      {job.channel ? ` · ${job.channel}` : ""}
                      {job.action ? ` · ${job.action}` : ""}
                    </p>
                    <p className="text-(--muted)">
                      {job.dueAt}
                      {job.dryRun ? " · dry-run" : ""}
                      {reason ? ` · ${reason}` : ""}
                    </p>
                  </div>
                  <span className="flex items-center gap-3">
                    <StatusBadge tone={jobTone(job.status)}>{job.status}</StatusBadge>
                    {job.status === "pending" || job.status === "claimed" || job.status === "in_progress" ? (
                      <button
                        type="button"
                        className="btn-danger rounded-2xl px-3 py-1 text-sm"
                        onClick={() => void stopEnrollment(job.enrollmentId)}
                      >
                        Stop lead
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
        </ul>
      </section>
    </AppShell>
  );
}
