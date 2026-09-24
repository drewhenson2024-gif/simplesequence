const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  running: "Running",
  paused: "Paused",
  restricted: "Restricted",
  stopped: "Stopped",
  replied: "Replied",
  completed: "Completed",
  pending: "Queued",
  claimed: "Queued",
  in_progress: "Sending",
  waiting: "Waiting",
  sent: "Sent",
  skipped: "Skipped",
  failed: "Failed",
  bounced: "Bounced",
  healthy: "Connected",
  throttled: "Slowed",
  all: "All",
  queued: "Queued",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
