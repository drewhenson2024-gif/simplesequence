"use client";

import { Switch } from "@/components/Toggle";
import { sequenceAllowance } from "@/lib/domain/linkedinFrequency";
import { connectionNoteGuidance, stepRequirement } from "@/lib/domain/linkedinPlan";
import { renderTemplate, VARIABLE_GROUPS, type LeadFields } from "@/lib/domain/templates";

export type EditorStep = {
  stepIndex: number;
  channel: "linkedin";
  action: "connection" | "message";
  delayHours: number;
  bodyTemplate: string;
  subjectTemplate: string | null;
  enabled: boolean;
  imageUrl?: string | null;
};

export type PreviewLead = {
  firstName: string;
  lastName: string;
  fullName: string;
  company: string;
  title: string;
  headline?: string;
  location?: string;
  about?: string;
  openingLine?: string;
  email: string | null;
  linkedinUrl: string | null;
  profileUrl?: string | null;
  publicUrl?: string | null;
};

type Kind = "connection" | "message";

function kindOf(step: EditorStep): Kind {
  return step.action === "connection" ? "connection" : "message";
}

function applyKind(kind: Kind): Pick<EditorStep, "channel" | "action"> {
  if (kind === "connection") return { channel: "linkedin", action: "connection" };
  return { channel: "linkedin", action: "message" };
}

function kindLabel(kind: Kind) {
  if (kind === "connection") return "LinkedIn connection";
  return "LinkedIn message";
}

function delayParts(hours: number): { value: number; unit: "h" | "d" } {
  if (hours >= 24 && hours % 24 === 0) return { value: hours / 24, unit: "d" };
  return { value: hours, unit: "h" };
}

function toHours(value: number, unit: "h" | "d") {
  return unit === "d" ? value * 24 : value;
}

const FALLBACK_LEAD: PreviewLead = {
  firstName: "",
  lastName: "",
  fullName: "",
  company: "",
  title: "",
  headline: "",
  location: "",
  about: "",
  openingLine: "",
  email: null,
  linkedinUrl: null,
  profileUrl: null,
};

function asFields(lead: PreviewLead): LeadFields {
  return {
    firstName: lead.firstName ?? "",
    lastName: lead.lastName ?? "",
    fullName: lead.fullName ?? "",
    company: lead.company ?? "",
    title: lead.title ?? "",
    headline: lead.headline ?? "",
    location: lead.location ?? "",
    about: lead.about ?? "",
    openingLine: lead.openingLine ?? "",
    email: lead.email ?? null,
    linkedinUrl: lead.linkedinUrl ?? null,
    profileUrl: lead.profileUrl || lead.publicUrl || lead.linkedinUrl,
  };
}

export function SequenceEditor({
  steps,
  leads,
  previewIndex,
  onPreviewIndex,
  editable,
  linkedinPlan,
  onChange,
  onAdd,
}: {
  steps: EditorStep[];
  leads: PreviewLead[];
  previewIndex: number;
  onPreviewIndex: (index: number) => void;
  editable: boolean;
  linkedinPlan?: string | null;
  onChange: (steps: EditorStep[]) => void;
  onAdd: (index: number, kind: Kind) => void;
}) {
  const lead = leads[previewIndex] ?? leads[0] ?? FALLBACK_LEAD;
  const leadCount = Math.max(leads.length, 1);
  const allowance = sequenceAllowance(linkedinPlan, steps);

  function patch(index: number, next: Partial<EditorStep>) {
    onChange(steps.map((step, i) => (i === index ? { ...step, ...next } : step)));
  }

  function remove(index: number) {
    onChange(steps.filter((_, i) => i !== index).map((step, i) => ({ ...step, stepIndex: i })));
  }

  function insertVar(index: number, field: string) {
    if (!editable) return;
    const step = steps[index];
    if (!step) return;
    patch(index, { bodyTemplate: `${step.bodyTemplate}{{${field}}}` });
  }

  return (
    <div className="min-w-0">
      <section className="mb-4">
        <p className="eyebrow">This sequence can send</p>
        {allowance.sends ? (
          <>
            <div className="stat-grid mt-3 grid-cols-3">
              {[
                ["Day", allowance.day],
                ["Week", allowance.week],
                ["Month", allowance.month],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="text-xs text-(--muted)">{label}</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-(--muted)">Set by {allowance.limitedBy.toLowerCase()}.</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-(--muted)">This sequence will not send on this account.</p>
        )}
      </section>
      {steps.map((step, index) => {
        const parts = delayParts(step.delayHours);
        const previewBody = renderTemplate(step.bodyTemplate, asFields(lead));
        const previewSubject = step.subjectTemplate ? renderTemplate(step.subjectTemplate, asFields(lead)) : null;
        return (
          <div key={`${step.stepIndex}-${index}`}>
            {index > 0 ? (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  disabled={!editable}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-(--line) bg-(--panel) text-(--muted) hover:border-(--ochre) hover:text-(--ochre) disabled:opacity-40"
                  onClick={() => onAdd(index, "message")}
                  aria-label="Add stage"
                >
                  +
                </button>
              </div>
            ) : null}
            <section className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-(--tint) text-xs font-semibold text-(--ochre)">
                    {index + 1}
                  </span>
                  {editable ? (
                    <select
                      className="field w-auto px-2 py-1 font-medium"
                      value={kindOf(step)}
                      onChange={(e) => patch(index, applyKind(e.target.value as Kind))}
                    >
                      <option value="connection">LinkedIn connection</option>
                      <option value="message">LinkedIn message</option>
                    </select>
                  ) : (
                    <p className="text-sm font-medium">{kindLabel(kindOf(step))}</p>
                  )}
                  {index > 0 ? (
                    <label className="ml-2 flex items-center gap-2 text-sm text-(--muted)">
                      Wait
                      <input
                        type="number"
                        min={0}
                        disabled={!editable}
                        className="field w-16 px-2 py-1"
                        value={parts.value}
                        onChange={(e) => patch(index, { delayHours: toHours(Number(e.target.value) || 0, parts.unit) })}
                      />
                      <select
                        disabled={!editable}
                        className="field w-auto px-2 py-1"
                        value={parts.unit}
                        onChange={(e) => patch(index, { delayHours: toHours(parts.value, e.target.value as "h" | "d") })}
                      >
                        <option value="h">hours</option>
                        <option value="d">days</option>
                      </select>
                    </label>
                  ) : null}
                </div>
                <div className="flex items-center gap-4">
                  <Switch
                    on={step.enabled}
                    disabled={!editable}
                    label="Enabled"
                    onChange={(next) => patch(index, { enabled: next })}
                  />
                  {editable ? (
                    <button type="button" className="text-sm text-(--danger)" onClick={() => remove(index)}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
              {(() => {
                const followsConnection = steps
                  .slice(0, index)
                  .some((row) => row.action === "connection");
                const requirement = stepRequirement({
                  action: step.action,
                  followsConnection,
                  plan: linkedinPlan,
                });
                return (
                  <div className="mt-3">
                    <p className="text-sm text-(--muted)">{requirement.need}</p>
                    {requirement.blocked ? (
                      <p className="mt-1 text-sm text-(--danger)">{requirement.blocked}</p>
                    ) : null}
                  </div>
                );
              })()}
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-sm text-(--muted)">
                    Message{kindOf(step) === "connection" ? " (optional)" : ""}
                  </p>
                  <textarea
                    disabled={!editable}
                    className="field mt-2 h-40 p-3"
                    value={step.bodyTemplate}
                    onChange={(e) => patch(index, { bodyTemplate: e.target.value })}
                  />
                  <p className="mt-2 text-xs text-(--muted)">
                    {step.bodyTemplate.trim().split(/\s+/).filter(Boolean).length} words · {step.bodyTemplate.length}{" "}
                    characters
                  </p>
                  {step.action === "connection" && connectionNoteGuidance(linkedinPlan, step.bodyTemplate) ? (
                    <p className="mt-2 text-sm text-(--muted)">
                      {connectionNoteGuidance(linkedinPlan, step.bodyTemplate)}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {VARIABLE_GROUPS.flatMap((group) => group.fields).map((field) => (
                      <button
                        key={field}
                        type="button"
                        disabled={!editable}
                        className="rounded-full border border-(--line) bg-(--panel) px-2 py-0.5 text-xs text-(--muted) hover:border-(--ochre) hover:text-(--ochre) disabled:opacity-40"
                        onClick={() => insertVar(index, field)}
                      >
                        {`{{${field}}}`}
                      </button>
                    ))}
                  </div>
                  <label className="mt-3 block text-sm text-(--muted)">
                    LinkedIn image URL (optional)
                    <input
                      disabled={!editable}
                      className="field mt-1.5"
                      placeholder="https://…"
                      value={step.imageUrl ?? ""}
                      onChange={(e) => patch(index, { imageUrl: e.target.value || null })}
                    />
                  </label>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm text-(--muted)">
                    <span>Preview · {lead.fullName || "Add people to fill in names"}</span>
                    <span>
                      <button
                        type="button"
                        className="px-1"
                        onClick={() => onPreviewIndex((previewIndex - 1 + leadCount) % leadCount)}
                      >
                        ‹
                      </button>
                      {Math.min(previewIndex + 1, leadCount)} of {leadCount}
                      <button
                        type="button"
                        className="px-1"
                        onClick={() => onPreviewIndex((previewIndex + 1) % leadCount)}
                      >
                        ›
                      </button>
                    </span>
                  </div>
                  <div className="mt-2 min-h-40 rounded-2xl bg-(--tint) p-4 text-sm whitespace-pre-wrap">
                    {previewSubject ? (
                      <>
                        <p className="text-(--muted)">Subject: {previewSubject}</p>
                        {"\n"}
                      </>
                    ) : null}
                    {previewBody || <span className="text-(--muted)">Empty</span>}
                  </div>
                </div>
              </div>
            </section>
          </div>
        );
      })}
      {editable ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-quiet"
            onClick={() => onAdd(steps.length, "connection")}
          >
            + Connection
          </button>
          <button
            type="button"
            className="btn btn-sm btn-quiet"
            onClick={() => onAdd(steps.length, "message")}
          >
            + LinkedIn message
          </button>
        </div>
      ) : null}
    </div>
  );
}
