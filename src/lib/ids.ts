export type Brand<T, B extends string> = T & { readonly __brand: B };

export type WorkspaceId = Brand<string, "WorkspaceId">;
export type UserId = Brand<string, "UserId">;
export type SenderId = Brand<string, "SenderId">;
export type ListId = Brand<string, "ListId">;
export type LeadId = Brand<string, "LeadId">;
export type CampaignId = Brand<string, "CampaignId">;
export type StepId = Brand<string, "StepId">;
export type EnrollmentId = Brand<string, "EnrollmentId">;
export type JobId = Brand<string, "JobId">;
export type MessageId = Brand<string, "MessageId">;
export type AuditId = Brand<string, "AuditId">;
export type OutboxId = Brand<string, "OutboxId">;

export const DEFAULT_WORKSPACE_ID = "ws_default" as WorkspaceId;
export const DEFAULT_USER_ID = "user_default" as UserId;

export function asWorkspaceId(value: string): WorkspaceId {
  return value as WorkspaceId;
}
export function asSenderId(value: string): SenderId {
  return value as SenderId;
}
export function asListId(value: string): ListId {
  return value as ListId;
}
export function asLeadId(value: string): LeadId {
  return value as LeadId;
}
export function asCampaignId(value: string): CampaignId {
  return value as CampaignId;
}
export function asEnrollmentId(value: string): EnrollmentId {
  return value as EnrollmentId;
}
export function asJobId(value: string): JobId {
  return value as JobId;
}

export function newId(prefix: string): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 16; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}_${out}`;
}
