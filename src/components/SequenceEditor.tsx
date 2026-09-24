"use client";

import { Switch } from "@/components/Toggle";
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
  onChange,
  onAdd,
}: {
  steps: EditorStep[];
  leads: PreviewLead[];
  previewIndex: number;
  onPreviewIndex: (index: number) => void;
  editable: boolean;
  onChange: (steps: EditorStep[]) => void;
  onAdd: (index: number, kind: Kind) => void;
}) {
  const lead = leads[previewIndex] ?? leads[0] ?? FALLBACK_LEAD;
  const leadCount = Math.max(leads.length, 1);

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
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-(--line) text-(--muted) hover:text-(--ink) disabled:opacity-40"
                  onClick={() => onAdd(index, "message")}
                  aria-label="Add stage"
                >
                  +
                </button>
              </div>
            ) : null}
            <section className="rounded-xl border border-(--line) bg-(--panel) p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-(--muted)">{index + 1}.</p>
                  {editable ? (
                    <select
                      className="rounded-md border border-(--line) bg-(--paper) px-2 py-1 text-sm font-medium"
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
                        className="w-14 rounded-md border border-(--line) bg-(--paper) px-2 py-1 text-(--ink)"
                        value={parts.value}
                        onChange={(e) => patch(index, { delayHours: toHours(Number(e.target.value) || 0, parts.unit) })}
                      />
                      <select
                        disabled={!editable}
                        className="rounded-md border border-(--line) bg-(--paper) px-2 py-1"
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
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-sm text-(--muted)">
                    Message{kindOf(step) === "connection" ? " (optional)" : ""}
                  </p>
                  <textarea
                    disabled={!editable}
                    className="mt-2 h-40 w-full rounded-md border border-(--line) bg-(--paper) p-3 text-sm"
                    value={step.bodyTemplate}
                    onChange={(e) => patch(index, { bodyTemplate: e.target.value })}
                  />
                  <p className="mt-2 text-xs text-(--muted)">
                    {step.bodyTemplate.trim().split(/\s+/).filter(Boolean).length} words · {step.bodyTemplate.length}{" "}
                    characters
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {VARIABLE_GROUPS.flatMap((group) => group.fields).map((field) => (
                      <button
                        key={field}
                        type="button"
                        disabled={!editable}
                        className="rounded-md border border-(--line) px-2 py-0.5 text-xs text-(--muted) hover:text-(--ink) disabled:opacity-40"
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
                      className="mt-1 w-full rounded-md border border-(--line) bg-(--paper) px-3 py-2 text-sm"
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
                  <div className="mt-2 min-h-40 rounded-md border border-(--line) bg-(--input) p-3 text-sm whitespace-pre-wrap">
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
            className="rounded-md border border-(--line) px-3 py-1.5 text-sm"
            onClick={() => onAdd(steps.length, "connection")}
          >
            + Connection
          </button>
          <button
            type="button"
            className="rounded-md border border-(--line) px-3 py-1.5 text-sm"
            onClick={() => onAdd(steps.length, "message")}
          >
            + LinkedIn message
          </button>
        </div>
      ) : null}
    </div>
  );
}
