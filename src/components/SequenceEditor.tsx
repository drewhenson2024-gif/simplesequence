"use client";

import { renderTemplate, templateVariables } from "@/lib/domain/templates";

export type EditorStep = {
  stepIndex: number;
  channel: "linkedin" | "email" | "gift";
  action: "connection" | "message" | "email" | "gift";
  delayHours: number;
  bodyTemplate: string;
  subjectTemplate: string | null;
  enabled: boolean;
  skipOverdueHours: number;
  imageUrl?: string | null;
  giftItem?: string | null;
  giftNote?: string | null;
};

export type PreviewLead = {
  firstName: string;
  lastName: string;
  fullName: string;
  company: string;
  title: string;
  openingLine: string;
  email: string | null;
  linkedinUrl: string | null;
};

type Kind = "connection" | "message" | "email" | "gift";

function kindOf(step: EditorStep): Kind {
  if (step.action === "gift" || step.channel === "gift") return "gift";
  return step.action === "connection" || step.action === "email" ? step.action : "message";
}

function applyKind(kind: Kind): Pick<EditorStep, "channel" | "action"> {
  if (kind === "email") return { channel: "email", action: "email" };
  if (kind === "gift") return { channel: "gift", action: "gift" };
  if (kind === "connection") return { channel: "linkedin", action: "connection" };
  return { channel: "linkedin", action: "message" };
}

function kindLabel(kind: Kind) {
  if (kind === "connection") return "LinkedIn · Connection";
  if (kind === "message") return "LinkedIn · Message";
  if (kind === "gift") return "Gift";
  return "Email";
}

function delayParts(hours: number): { value: number; unit: "h" | "d" } {
  if (hours >= 24 && hours % 24 === 0) return { value: hours / 24, unit: "d" };
  return { value: hours, unit: "h" };
}

function toHours(value: number, unit: "h" | "d") {
  return unit === "d" ? value * 24 : value;
}

const FALLBACK_LEAD: PreviewLead = {
  firstName: "Ada",
  lastName: "Lovelace",
  fullName: "Ada Lovelace",
  company: "Analytical Engines",
  title: "Countess",
  openingLine: "Saw your note on difference engines",
  email: "ada@example.com",
  linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
};

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

  function patch(index: number, patch: Partial<EditorStep>) {
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function remove(index: number) {
    onChange(steps.filter((_, i) => i !== index).map((step, i) => ({ ...step, stepIndex: i })));
  }

  return (
    <div>
      {steps.map((step, index) => {
        const parts = delayParts(step.delayHours);
        const previewBody = renderTemplate(step.bodyTemplate, lead);
        const previewSubject = step.subjectTemplate ? renderTemplate(step.subjectTemplate, lead) : null;
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
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-medium">
                  {index + 1}. {kindLabel(kindOf(step))}
                </p>
                {editable ? (
                  <select
                    className="rounded border border-(--line) bg-(--input) px-2 py-1 text-sm"
                    value={kindOf(step)}
                    onChange={(e) => patch(index, applyKind(e.target.value as Kind))}
                  >
                    <option value="connection">LinkedIn · Connection</option>
                    <option value="message">LinkedIn · Message</option>
                    <option value="email">Email</option>
                    {kindOf(step) === "gift" ? <option value="gift">Gift</option> : null}
                  </select>
                ) : null}
                {index > 0 ? (
                  <label className="ml-auto flex items-center gap-2 text-sm">
                    Wait
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
                      className="rounded border border-(--line) bg-(--input) px-2 py-1"
                      value={parts.unit}
                      onChange={(e) => patch(index, { delayHours: toHours(parts.value, e.target.value as "h" | "d") })}
                    >
                      <option value="h">hours</option>
                      <option value="d">days</option>
                    </select>
                  </label>
                ) : (
                  <span className="ml-auto text-sm text-(--muted)">Sends first</span>
                )}
                <label className="flex items-center gap-2 text-sm">
                  Skip overdue
                  <input
                    type="number"
                    min={0}
                    disabled={!editable}
                    className="w-16 rounded border border-(--line) bg-(--input) px-2 py-1"
                    value={Math.round((step.skipOverdueHours ?? 72) / 24)}
                    onChange={(e) => patch(index, { skipOverdueHours: (Number(e.target.value) || 0) * 24 })}
                  />
                  days
                </label>
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
                  <button type="button" className="text-sm text-(--muted) underline" onClick={() => remove(index)}>
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-(--muted)">Message{kindOf(step) === "connection" ? " (optional)" : ""}</p>
                  {kindOf(step) === "email" ? (
                    <input
                      disabled={!editable}
                      className="mt-2 w-full rounded border border-(--line) bg-(--input) px-3 py-2 text-sm"
                      placeholder="Subject"
                      value={step.subjectTemplate ?? ""}
                      onChange={(e) => patch(index, { subjectTemplate: e.target.value })}
                    />
                  ) : null}
                  {kindOf(step) === "gift" ? (
                    <input
                      disabled={!editable}
                      className="mt-2 w-full rounded border border-(--line) bg-(--input) px-3 py-2 text-sm"
                      placeholder="Item (cookies, cupcakes, cake)"
                      value={step.giftItem ?? ""}
                      onChange={(e) => patch(index, { giftItem: e.target.value || null })}
                    />
                  ) : null}
                  <textarea
                    disabled={!editable}
                    className="mt-2 h-36 w-full rounded border border-(--line) bg-(--input) p-3 text-sm"
                    value={step.bodyTemplate}
                    onChange={(e) => patch(index, { bodyTemplate: e.target.value })}
                  />
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {templateVariables().map((field) => (
                      <button
                        key={field}
                        type="button"
                        disabled={!editable}
                        className="rounded border border-(--line) px-2 py-1"
                        onClick={() => patch(index, { bodyTemplate: `${step.bodyTemplate}{{${field}}}` })}
                      >
                        {`{{${field}}}`}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-(--muted)">
                    {step.bodyTemplate.trim().split(/\s+/).filter(Boolean).length} words · {step.bodyTemplate.length}{" "}
                    characters
                  </p>
                  {kindOf(step) === "gift" ? (
                    <p className="mt-2 text-xs text-(--muted)">
                      Note above is handwritten copy. Office address comes from the lead’s custom
                      office_address / company. Live courier delivery will be available soon.
                    </p>
                  ) : null}
                  {kindOf(step) !== "email" && kindOf(step) !== "gift" ? (
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
                  ) : null}
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm text-(--muted)">
                    <span>Preview · {lead.fullName}</span>
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
            </section>
          </div>
        );
      })}
      {editable ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" className="rounded-md border border-(--line) px-3 py-2 text-sm" onClick={() => onAdd(steps.length, "connection")}>
            + Connection
          </button>
          <button type="button" className="rounded-md border border-(--line) px-3 py-2 text-sm" onClick={() => onAdd(steps.length, "message")}>
            + LinkedIn message
          </button>
          <button type="button" className="rounded-md border border-(--line) px-3 py-2 text-sm" onClick={() => onAdd(steps.length, "email")}>
            + Email
          </button>
        </div>
      ) : null}
    </div>
  );
}
