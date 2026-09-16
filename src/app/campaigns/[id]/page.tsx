"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell, BackLink } from "@/components/AppShell";
import { SequenceEditor, type EditorStep, type PreviewLead } from "@/components/SequenceEditor";
import { SequenceReport } from "@/components/SequenceReport";
import { StatusBadge } from "@/components/Toggle";
import { scheduleDelete } from "@/lib/client/pendingDelete";
import { usePeopleLists } from "@/lib/client/peopleCache";
import { refreshSequence, setSequenceDetail, useSequenceDetail } from "@/lib/client/sequencesCache";

type Campaign = {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
  steps: Array<{
    stepIndex: number;
    channel: string;
    action: string;
    delayHours: number;
    bodyTemplate: string;
    subjectTemplate: string | null;
    enabled?: number;
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
  senderSignal?: "throttled" | "restricted" | null;
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

const ACTION_BTN = "rounded-md px-4 py-2";

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
  const [tab, setTab] = useState<"stages" | "report" | null>(null);
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
  const view = tab ?? (data?.status === "draft" ? "stages" : "report");
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
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-2">
            <StatusBadge
              tone={
                data.status === "running"
                  ? "ok"
                  : data.status === "restricted"
                    ? "danger"
                    : data.status === "paused"
                      ? "wait"
                      : "muted"
              }
            >
              {data.status}
            </StatusBadge>
          </p>
          {editable ? (
            <input
              className="w-full min-w-0 rounded-md border border-(--line) bg-(--paper) px-3 py-2 text-2xl leading-normal"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
            />
          ) : (
            <h1 className="text-2xl leading-normal break-words">{data.name}</h1>
          )}
          <p className="mt-2 text-sm text-(--muted)">
            {steps.length} stages · {durationLabel} · {data.enrollments.length} people
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
      </div>
      {data.status === "restricted" || data.senderSignal === "restricted" ? (
        <p className="mt-3 text-sm text-(--danger)">Restricted. Connect another account in Settings.</p>
      ) : null}
      {data.status === "paused" && data.senderSignal === "throttled" ? (
        <p className="mt-3 text-sm text-(--ochre)">
          Stopped — LinkedIn asked us to wait. Resume after you check LinkedIn.
        </p>
      ) : null}
      {data.status === "draft" ? (
        <p className="mt-3 text-sm text-(--muted)">This is a draft — nothing is sent until you hit Start.</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-(--danger)">{error}</p> : null}

      <div className="mt-6 flex gap-5 border-b border-(--line) text-sm">
        {(["stages", "report"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`-mb-px border-b-2 pb-2 capitalize ${
              view === key ? "border-(--ink) text-(--ink)" : "border-transparent text-(--muted)"
            }`}
            onClick={() => setTab(key)}
          >
            {key}
          </button>
        ))}
      </div>

      {view === "stages" ? (
        <div className="mt-6">
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
          <section className="mt-8 rounded-xl border border-(--line) p-4">
            <h2 className="text-lg">People in this sequence</h2>
            <p className="mt-1 text-sm text-(--muted)">Pick a list of LinkedIn URLs, then add those people here.</p>
            <div className="mt-3 flex gap-2">
              <select
                className="rounded-md border border-(--line) bg-(--paper) px-3 py-2"
                value={listId}
                onChange={(e) => setListId(e.target.value)}
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void addLeads()} className="rounded-md border border-(--line) px-4 py-2">
                Add from list
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className="mt-6">
          <SequenceReport
            campaignId={data.id}
            status={data.status}
            createdAt={data.createdAt}
            senderSignal={data.senderSignal}
            steps={steps}
            enrollments={data.enrollments}
            enrollmentCounts={data.enrollmentCounts}
            jobs={data.jobs ?? []}
            jobCounts={data.jobCounts ?? {}}
            durationLabel={durationLabel}
            outboxFilter={outboxFilter}
            onOutboxFilter={setOutboxFilter}
            onStop={(id) => void stopEnrollment(id)}
          />
        </div>
      )}
    </AppShell>
  );
}
