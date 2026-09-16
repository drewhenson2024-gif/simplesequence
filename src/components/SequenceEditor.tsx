"use client";

import { useState } from "react";
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
  if (kind === "connection") return "LinkedIn · Connection";
  return "LinkedIn · Message";
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
  const [activeStep, setActiveStep] = useState(0);
  const lead = leads[previewIndex] ?? leads[0] ?? FALLBACK_LEAD;
  const leadCount = Math.max(leads.length, 1);
  const focused = Math.min(Math.max(activeStep, 0), Math.max(steps.length - 1, 0));

  function patch(index: number, patch: Partial<EditorStep>) {
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function remove(index: number) {
    onChange(steps.filter((_, i) => i !== index).map((step, i) => ({ ...step, stepIndex: i })));
  }

  function insertVar(field: string) {
    if (!editable || steps.length === 0) return;
    const step = steps[focused];
    if (!step) return;
    patch(focused, { bodyTemplate: `${step.bodyTemplate}{{${field}}}` });
  }

  return (
    <div className="flex items-start gap-6">
      <aside className="w-44 shrink-0 sticky top-24">
        <p className="text-sm text-(--muted)">Variables</p>
        {VARIABLE_GROUPS.map((group) => (
          <div key={group.heading} className="mt-4">
            <p className="text-xs uppercase tracking-wide text-(--muted)">{group.heading}</p>
            <div className="mt-2 flex flex-col gap-1">
              {group.fields.map((field) => (
                <button
                  key={field}
                  type="button"
                  disabled={!editable}
                  className="rounded border border-(--line) px-2 py-1 text-left text-xs"
                  onClick={() => insertVar(field)}
                >
                  {`{{${field}}}`}
                </button>
              ))}
            </div>
          </div>
        ))}
      </aside>

      <div className="min-w-0 flex-1">
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
                    className="rounded-full border border-(--line) px-3 py-0.5 text-sm text-(--muted)"
                    onClick={() => onAdd(index, "message")}
                  >
                    + Add stage
                  </button>
                </div>
              ) : null}
              <section className={`rounded-lg border border-(--line) bg-(--panel) p-4 ${step.enabled ? "" : "opacity-60"}`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  <aside className="w-full shrink-0 space-y-3 md:w-44">
                    <p className="font-medium">{index + 1}.</p>
                  {editable ? (
                    <label className="block text-sm">
                      <span className="text-(--muted)">Type</span>
                      <select
                        className="mt-1 w-full rounded border border-(--line) bg-(--input) px-2 py-1"
                        value={kindOf(step)}
                        onChange={(e) => patch(index, applyKind(e.target.value as Kind))}
                      >
                        <option value="connection">LinkedIn · Connection</option>
                        <option value="message">LinkedIn · Message</option>
                      </select>
                    </label>
                  ) : (
                    <p className="text-sm">{kindLabel(kindOf(step))}</p>
                  )}
                  {index > 0 ? (
                    <label className="block text-sm">
                      <span className="text-(--muted)">Wait</span>
                      <span className="mt-1 flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          disabled={!editable}
                          className="w-16 rounded border border-(--line) bg-(--input) px-2 py-1"
                          value={parts.value}
                          onChange={(e) => patch(index, { delayHours: toHours(Number(e.target.value) || 0, parts.unit) })}
                        />
                        <select
                          disabled={!editable}
                          className="min-w-0 flex-1 rounded border border-(--line) bg-(--input) px-2 py-1"
                          value={parts.unit}
                          onChange={(e) => patch(index, { delayHours: toHours(parts.value, e.target.value as "h" | "d") })}
                        >
                          <option value="h">hours</option>
                          <option value="d">days</option>
                        </select>
                      </span>
                    </label>
                  ) : (
                    <p className="text-sm text-(--muted)">Sends first</p>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={step.enabled}
                      onChange={(e) => patch(index, { enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                  {editable && steps.length > 1 ? (
                    <button type="button" className="btn-danger rounded-2xl px-3 py-1 text-sm" onClick={() => remove(index)}>
                      Remove
                    </button>
                  ) : null}
                </aside>

                <div className="min-w-0 flex-1 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-(--muted)">Message{kindOf(step) === "connection" ? " (optional)" : ""}</p>
                    <textarea
                      disabled={!editable}
                      className="mt-2 h-36 w-full rounded border border-(--line) bg-(--input) p-3 text-sm"
                      value={step.bodyTemplate}
                      onFocus={() => setActiveStep(index)}
                      onChange={(e) => patch(index, { bodyTemplate: e.target.value })}
                    />
                    <p className="mt-2 text-xs text-(--muted)">
                      {step.bodyTemplate.trim().split(/\s+/).filter(Boolean).length} words · {step.bodyTemplate.length}{" "}
                      characters
                    </p>
                    <label className="mt-3 block text-sm text-(--muted)">
                      LinkedIn image URL (optional)
                      <input
                        disabled={!editable}
                        className="mt-1 w-full rounded border border-(--line) bg-(--input) px-3 py-2 text-sm"
                        placeholder="https://…"
                        value={step.imageUrl ?? ""}
                        onChange={(e) => patch(index, { imageUrl: e.target.value || null })}
                      />
                    </label>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm text-(--muted)">
                      <span>Preview · {lead.fullName || "enroll people to fill merge fields"}</span>
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
                    <div className="mt-2 min-h-36 rounded border border-(--line) bg-(--input) p-3 text-sm whitespace-pre-wrap">
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
                </div>
              </section>
            </div>
          );
        })}
        {editable ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" className="rounded-2xl border border-(--line) px-3 py-2 text-sm" onClick={() => onAdd(steps.length, "connection")}>
              + Connection
            </button>
            <button type="button" className="rounded-2xl border border-(--line) px-3 py-2 text-sm" onClick={() => onAdd(steps.length, "message")}>
              + LinkedIn message
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
