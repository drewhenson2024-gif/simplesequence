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
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${cls}`}>{children}</span>;
}

export function SoonBadge() {
  return (
    <StatusBadge tone="wait">Coming soon</StatusBadge>
  );
}
