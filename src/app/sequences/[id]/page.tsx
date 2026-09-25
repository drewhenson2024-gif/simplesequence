"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell, BackLink } from "@/components/AppShell";
import { SequenceEditor, type EditorStep } from "@/components/SequenceEditor";
import { scheduleDelete } from "@/lib/client/pendingDelete";

type SequencePlan = {
  id: string;
  name: string;
  steps: Array<{
    stepIndex: number;
    action: string;
    delayHours: number;
    bodyTemplate: string;
    subjectTemplate: string | null;
    enabled?: number;
    imageUrl?: string | null;
  }>;
};

function toEditor(steps: SequencePlan["steps"]): EditorStep[] {
  return [...steps]
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
  return {
    stepIndex: index,
    channel: "linkedin",
    action: kind,
    delayHours: index === 0 ? 0 : 0,
    bodyTemplate: "",
    subjectTemplate: null,
    enabled: true,
    imageUrl: null,
  };
}

export default function SequenceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<EditorStep[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [linkedinPlan, setLinkedinPlan] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/settings")
      .then((res) => res.json())
      .then((body: { linkedinSenderId?: string | null; senders?: Array<{ id: string; linkedinPlan?: string | null }> }) => {
        const selected = body.senders?.find((sender) => sender.id === body.linkedinSenderId) ?? body.senders?.[0];
        setLinkedinPlan(selected?.linkedinPlan ?? null);
      })
      .catch(() => setLinkedinPlan(null));
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/sequences/${params.id}`);
      const body = (await res.json()) as SequencePlan & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not load sequence");
        setLoaded(true);
        return;
      }
      setName(body.name);
      setSteps(toEditor(body.steps ?? []));
      setLoaded(true);
    })();
  }, [params.id]);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/sequences/${params.id}`, {
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
      setError(typeof body.error === "string" ? body.error : "Could not save");
      return;
    }
    setName(body.name);
    setSteps(toEditor(body.steps ?? []));
    setDirty(false);
  }

  if (!loaded) {
    return (
      <AppShell>
        <BackLink href="/sequences" label="Sequences" />
        <p className="mt-4 text-sm text-(--muted)">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <BackLink href="/sequences" label="Sequences" />
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <input
            className="field min-w-0 text-2xl font-semibold tracking-tight"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
          />
          <p className="mt-2 text-sm text-(--muted)">
            {steps.length} {steps.length === 1 ? "action" : "actions"}. No people. Nothing sends from here. Leave a delay at 0 to send that action as soon as the account has room.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="btn btn-primary">
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => router.push(`/campaigns?sequence=${params.id}`)}>
            Use in a campaign
          </button>
          <button
            type="button"
            className="btn btn-quiet-danger"
            onClick={() => {
              scheduleDelete({ kind: "sequence", id: params.id, name });
              router.push("/sequences");
            }}
          >
            Delete
          </button>
        </div>
      </div>
      {error ? <p className="mt-3 text-sm text-(--danger)">{error}</p> : null}
      <div className="mt-6">
        <SequenceEditor
          steps={steps}
          leads={[]}
          linkedinPlan={linkedinPlan}
          previewIndex={previewIndex}
          onPreviewIndex={setPreviewIndex}
          editable
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
    </AppShell>
  );
}
