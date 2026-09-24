import type { ReactNode } from "react";

export function Toggle({
  on,
  onChange,
  onLabel = "On",
  offLabel = "Off",
  danger = false,
  disabled = false,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  onLabel?: string;
  offLabel?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`inline-flex min-w-24 items-center justify-center rounded-full px-4 py-1.5 text-sm font-medium ${
        on
          ? danger
            ? "bg-(--danger) text-(--paper)"
            : "bg-(--ok) text-(--paper)"
          : "border border-(--line) text-(--muted)"
      } disabled:opacity-40`}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "ok" | "off" | "wait" | "danger" | "muted";
  children: ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "bg-(--ok) text-(--paper)"
      : tone === "danger"
        ? "bg-(--danger) text-(--paper)"
        : tone === "wait"
          ? "border border-(--ochre) text-(--ochre)"
          : "border border-(--line) text-(--muted)";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function SoonBadge() {
  return (
    <StatusBadge tone="wait">Coming soon</StatusBadge>
  );
}

export function Switch({
  on,
  onChange,
  disabled = false,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="inline-flex items-center gap-2 text-sm text-(--muted) disabled:opacity-40"
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
          on ? "bg-(--ochre)" : "bg-(--line)"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${
            on ? "left-4" : "left-0.5"
          }`}
        />
      </span>
      {label ? <span>{label}</span> : null}
    </button>
  );
}
