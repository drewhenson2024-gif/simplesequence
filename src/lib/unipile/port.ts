export type UnipileInviteInput = {
  accountId: string;
  profileUrl: string;
  body: string;
};

export type UnipileMessageInput = {
  accountId: string;
  profileUrl: string;
  body: string;
};

export type UnipileEmailInput = {
  accountId: string;
  to: string;
  subject: string;
  body: string;
};

export type UnipileSendResult = {
  providerId: string;
  dryRun: boolean;
};

export type UnipilePort = {
  hostedAuthUrl(channel: "linkedin" | "email"): Promise<string>;
  invite(input: UnipileInviteInput): Promise<UnipileSendResult>;
  message(input: UnipileMessageInput): Promise<UnipileSendResult>;
  sendEmail(input: UnipileEmailInput): Promise<UnipileSendResult>;
};

export class MockUnipile implements UnipilePort {
  readonly calls: Array<{ kind: string; input: unknown }> = [];

  async hostedAuthUrl(channel: "linkedin" | "email"): Promise<string> {
    return `https://unipile.example/hosted-auth?channel=${channel}&sandbox=1`;
  }

  async invite(input: UnipileInviteInput): Promise<UnipileSendResult> {
    this.calls.push({ kind: "invite", input });
    return { providerId: `mock_invite_${this.calls.length}`, dryRun: true };
  }

  async message(input: UnipileMessageInput): Promise<UnipileSendResult> {
    this.calls.push({ kind: "message", input });
    return { providerId: `mock_msg_${this.calls.length}`, dryRun: true };
  }

  async sendEmail(input: UnipileEmailInput): Promise<UnipileSendResult> {
    this.calls.push({ kind: "email", input });
    return { providerId: `mock_email_${this.calls.length}`, dryRun: true };
  }
}

export function createUnipilePort(env: NodeJS.ProcessEnv = process.env): UnipilePort {
  if (env.UNIPILE_API_KEY && env.UNIPILE_DSN) {
    return new LiveUnipileStub(env.UNIPILE_API_KEY, env.UNIPILE_DSN);
  }
  return new MockUnipile();
}

/** Live HTTP is wired only after keys exist. Until then this still refuses to send. */
export class LiveUnipileStub implements UnipilePort {
  constructor(
    private readonly apiKey: string,
    private readonly dsn: string,
  ) {}

  async hostedAuthUrl(channel: "linkedin" | "email"): Promise<string> {
    const base = this.dsn.replace(/\/$/, "");
    return `${base}/hosted-auth?channel=${channel}`;
  }

  async invite(): Promise<UnipileSendResult> {
    throw new Error("Live Unipile send is not enabled in this checkout yet — use sandbox.");
  }

  async message(): Promise<UnipileSendResult> {
    throw new Error("Live Unipile send is not enabled in this checkout yet — use sandbox.");
  }

  async sendEmail(): Promise<UnipileSendResult> {
    throw new Error("Live Unipile send is not enabled in this checkout yet — use sandbox.");
  }
}
