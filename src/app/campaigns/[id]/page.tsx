"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell, BackLink } from "@/components/AppShell";
import { SequenceEditor, type EditorStep, type PreviewLead } from "@/components/SequenceEditor";
import { SequenceReport } from "@/components/SequenceReport";
import { StatusBadge } from "@/components/Toggle";
import { statusLabel } from "@/lib/ui/display";
import { scheduleDelete } from "@/lib/client/pendingDelete";
import { usePeopleLists } from "@/lib/client/peopleCache";
import { refreshSequence, setSequenceDetail, useSequenceDetail } from "@/lib/client/sequencesCache";

type Campaign = {
  id: string;
  name: string;
  status: string;
  priority?: number;
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
  linkedinPlan?: string | null;
  sequenceName?: string | null;
  listName?: string | null;
  accountBudget?: {
    categoryLabel: string;
    used: number;
    allowance: number;
    periodLabel: string;
    note: string | null;
  } | null;
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

const ACTION_BTN = "btn";

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

  const editable = data?.status === "draft" || data?.status === "running" || data?.status === "paused";
  const view = tab ?? (data?.status === "draft" ? "stages" : "report");
  const durationHours = steps.reduce((sum, step) => sum + step.delayHours, 0);
  const durationLabel =
    durationHours >= 24 && durationHours % 24 === 0 ? `${durationHours / 24} days` : `${durationHours} hours`;

  async function savePriority(priority: number) {
    setError(null);
    const res = await fetch(`/api/campaigns/${params.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ priority }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error);
      return;
    }
    applyCampaign(body, false);
  }

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
        <BackLink href="/campaigns" label="Campaigns" />
        <p className="mt-4 text-sm text-(--muted)">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <BackLink href="/campaigns" label="Campaigns" />
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
              {statusLabel(data.status)}
            </StatusBadge>
          </p>
          {editable ? (
            <input
              className="field min-w-0 text-2xl font-semibold tracking-tight"
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
            {steps.length} actions · {durationLabel} · {data.enrollments.length} people
            {data.sequenceName ? ` · Sequence: ${data.sequenceName}` : ""}
            {data.listName ? ` · People: ${data.listName}` : ""}
          </p>
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-(--muted)">
            Priority
            <input
              key={data.priority ?? 0}
              type="number"
              className="field w-20 px-2 py-1"
              defaultValue={data.priority ?? 0}
              onBlur={(e) => {
                const next = Number(e.target.value);
                if (!Number.isInteger(next) || next === (data.priority ?? 0)) return;
                void savePriority(next);
              }}
            />
            A higher number sends first when there is a free slot.
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => void save()}
              className={`${ACTION_BTN} ${data.status === "draft" || data.status === "paused" ? "btn-quiet" : "btn-primary"}`}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          ) : null}
          {data.status === "draft" || data.status === "paused" ? (
            <button type="button" onClick={() => void start()} className={`${ACTION_BTN} btn-primary`}>
              Start
            </button>
          ) : null}
          {data.status === "running" ? (
            <button type="button" onClick={() => void pause()} className={`${ACTION_BTN} btn-quiet`}>
              Pause
            </button>
          ) : null}
          {data.status === "draft" ? (
            <button type="button" onClick={deleteDraft} className={`${ACTION_BTN} btn-quiet-danger`}>
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
        <p className="mt-3 text-sm text-(--muted)">This is a draft. Nothing sends until you press Start.</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-(--danger)">{error}</p> : null}

      <div className="mt-6 flex gap-5 border-b border-(--line) text-sm">
        {(["stages", "report"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`-mb-px border-b-2 pb-2.5 font-medium capitalize ${
              view === key ? "border-(--ochre) text-(--ochre)" : "border-transparent text-(--muted) hover:text-(--ink)"
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
            linkedinPlan={data.linkedinPlan}
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
          <p className="mt-4 text-sm text-(--muted)">
            These actions belong to this campaign. Editing the sequence later does not change them.
            {data.status === "running" || data.status === "paused"
              ? " Saving updates steps that have not been sent."
              : ""}
          </p>
          {data.status === "draft" ? (
            <section className="card mt-8 p-5">
              <h2 className="text-lg">People</h2>
              <p className="mt-1 text-sm text-(--muted)">
                {data.listName ? `Started from ${data.listName}. ` : ""}
                Add another people list to this campaign.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <select
                  className="field w-auto min-w-56"
                  value={listId}
                  onChange={(e) => setListId(e.target.value)}
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => void addLeads()} className="btn btn-quiet">
                  Add from list
                </button>
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="mt-6">
          <SequenceReport
            campaignId={data.id}
            status={data.status}
            createdAt={data.createdAt}
            senderSignal={data.senderSignal}
            accountBudget={data.accountBudget}
            linkedinPlan={data.linkedinPlan}
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
