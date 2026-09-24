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

const ACTIVITY_LABELS: Record<string, string> = {
  import_leads: "Added people",
  update_list: "Renamed a list",
  remove_lead_from_list: "Removed a person",
  delete_list: "Deleted a list",
  delete_campaign: "Deleted a sequence",
  create_campaign: "Created a sequence",
  update_campaign: "Updated a sequence",
  add_leads_to_campaign: "Added people to a sequence",
  start_campaign: "Started a sequence",
  pause_campaign: "Paused a sequence",
  resume_campaign: "Resumed a sequence",
  connect_account: "Connected an account",
  reconnect_account: "Reconnected LinkedIn",
  remove_linkedin_account: "Removed LinkedIn",
  sync_unipile_accounts: "Refreshed accounts",
  stop_lead: "Stopped a person",
  reply_to_lead: "Sent a reply",
  record_reply: "Recorded a reply",
  record_bounce: "Recorded a bounce",
  update_settings: "Updated settings",
  update_frequency: "Updated frequency",
  export_leads: "Exported people",
  suggest_learnings: "Reviewed suggestions",
  apply_learnings: "Saved a new draft",
  ingest_signals: "Checked for updates",
  qualify_leads: "Reviewed people",
  search_people: "Looked up people",
  invite_quota: "Hit the connection cap",
  sender_throttled: "LinkedIn slowed the account",
  sender_restricted: "LinkedIn restricted the account",
  sender_throttle_cleared: "LinkedIn wait cleared",
};

export function activityLabel(action: string): string {
  return (
    ACTIVITY_LABELS[action] ??
    action
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

export function timezoneLabel(zone: string | null | undefined): string {
  if (!zone) return "—";
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longGeneric" })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    return name ?? zone.replaceAll("_", " ");
  } catch {
    return zone.replaceAll("_", " ");
  }
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
