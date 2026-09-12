export class IllegalTransitionError extends Error {
  constructor(
    public readonly machine: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Illegal ${machine} transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export const campaignStates = ["draft", "running", "paused", "restricted"] as const;
export type CampaignStatus = (typeof campaignStates)[number];

export const enrollmentStates = [
  "pending",
  "waiting",
  "in_progress",
  "completed",
  "replied",
  "bounced",
  "stopped",
  "failed",
] as const;
export type EnrollmentStatus = (typeof enrollmentStates)[number];

export const senderStates = ["pending", "healthy", "restricted", "disconnected"] as const;
export type SenderStatus = (typeof senderStates)[number];

export const jobStates = [
  "pending",
  "claimed",
  "in_progress",
  "sent",
  "skipped",
  "failed",
  "cancelled",
] as const;
export type JobStatus = (typeof jobStates)[number];

const campaignGraph: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["running"],
  running: ["paused", "restricted"],
  paused: ["running", "restricted"],
  restricted: [],
};

const enrollmentGraph: Record<EnrollmentStatus, readonly EnrollmentStatus[]> = {
  pending: ["waiting", "stopped"],
  waiting: ["in_progress", "stopped", "replied", "bounced", "failed"],
  in_progress: ["waiting", "completed", "replied", "bounced", "stopped", "failed"],
  completed: [],
  replied: [],
  bounced: [],
  stopped: [],
  failed: [],
};

const senderGraph: Record<SenderStatus, readonly SenderStatus[]> = {
  pending: ["healthy", "disconnected"],
  healthy: ["restricted", "disconnected"],
  restricted: [],
  disconnected: ["pending", "healthy"],
};

const jobGraph: Record<JobStatus, readonly JobStatus[]> = {
  pending: ["claimed", "cancelled"],
  claimed: ["in_progress", "cancelled", "pending"],
  in_progress: ["sent", "skipped", "failed", "pending"],
  sent: [],
  skipped: [],
  failed: [],
  cancelled: [],
};

function transition<S extends string>(
  machine: string,
  graph: Record<S, readonly S[]>,
  from: S,
  to: S,
): S {
  if (!graph[from].includes(to)) {
    throw new IllegalTransitionError(machine, from, to);
  }
  return to;
}

export function transitionCampaign(from: CampaignStatus, to: CampaignStatus): CampaignStatus {
  return transition("campaign", campaignGraph, from, to);
}

export function transitionEnrollment(
  from: EnrollmentStatus,
  to: EnrollmentStatus,
): EnrollmentStatus {
  return transition("enrollment", enrollmentGraph, from, to);
}

export function transitionSender(from: SenderStatus, to: SenderStatus): SenderStatus {
  return transition("sender", senderGraph, from, to);
}

export function transitionJob(from: JobStatus, to: JobStatus): JobStatus {
  return transition("send_job", jobGraph, from, to);
}

export function isTerminalEnrollment(status: EnrollmentStatus): boolean {
  return ["completed", "replied", "bounced", "stopped", "failed"].includes(status);
}

export function canStartCampaign(status: CampaignStatus): boolean {
  return status === "draft" || status === "paused";
}
