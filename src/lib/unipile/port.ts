export type UnipileInviteInput = {
  accountId: string;
  profileUrl: string;
  body: string;
  imageUrl?: string | null;
};

export type UnipileMessageInput = {
  accountId: string;
  profileUrl: string;
  body: string;
  imageUrl?: string | null;
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

export type UnipileAccount = {
  id: string;
  type?: string;
  provider?: string;
  sources?: string[];
  name?: string;
  connection_params?: { mail?: string; im?: string };
};

export function channelFromUnipileAccount(account: UnipileAccount): "linkedin" | "email" | null {
  const blob = [account.type, account.provider, ...(account.sources ?? [])].filter(Boolean).join(" ").toUpperCase();
  if (blob.includes("LINKEDIN")) return "linkedin";
  if (/(GOOGLE|OUTLOOK|MAIL|IMAP|GMAIL|MICROSOFT)/.test(blob)) return "email";
  return null;
}

export type UnipilePort = {
  hostedAuthUrl(channel: "linkedin" | "email"): Promise<string>;
  invite(input: UnipileInviteInput): Promise<UnipileSendResult>;
  message(input: UnipileMessageInput): Promise<UnipileSendResult>;
  sendEmail(input: UnipileEmailInput): Promise<UnipileSendResult>;
  listAccounts?(): Promise<UnipileAccount[]>;
  lookupProfile?(input: { profileUrl: string; accountId?: string }): Promise<{
    name?: string;
    headline?: string;
    profileUrl?: string;
  }>;
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

  async listAccounts(): Promise<UnipileAccount[]> {
    return [];
  }

  async lookupProfile(input: { profileUrl: string }): Promise<{ name?: string; headline?: string; profileUrl?: string }> {
    this.calls.push({ kind: "lookup", input });
    const slug = input.profileUrl.split("/").filter(Boolean).pop() ?? "profile";
    return { name: slug.replace(/-/g, " "), headline: `Operator · ${slug}`, profileUrl: input.profileUrl };
  }
}

export function keysPresent(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.UNIPILE_API_KEY && env.UNIPILE_DSN);
}

export function createUnipilePort(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { sendEnabled?: boolean },
): UnipilePort {
  if (keysPresent(env)) {
    return new LiveUnipile(env.UNIPILE_API_KEY!, env.UNIPILE_DSN!, {
      sendEnabled: opts?.sendEnabled ?? true,
      appUrl:
        env.APP_URL ??
        (env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
          : env.VERCEL_URL
            ? `https://${env.VERCEL_URL}`
            : "https://simplesequence-three.vercel.app"),
    });
  }
  return new MockUnipile();
}

export class LiveUnipile implements UnipilePort {
  constructor(
    private readonly apiKey: string,
    private readonly dsn: string,
    private readonly opts: { sendEnabled: boolean; appUrl: string },
  ) {}

  private base(): string {
    return this.dsn.replace(/\/$/, "");
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${this.base()}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "X-API-KEY": this.apiKey,
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    }
    if (!res.ok) {
      throw new Error(`Unipile ${res.status} ${path}: ${text.slice(0, 400)}`);
    }
    return body;
  }

  async hostedAuthUrl(channel: "linkedin" | "email"): Promise<string> {
    const expires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const providers = channel === "linkedin" ? ["LINKEDIN"] : ["GOOGLE", "OUTLOOK"];
    const body = (await this.request("/api/v1/hosted/accounts/link", {
      method: "POST",
      body: JSON.stringify({
        type: "create",
        providers,
        api_url: this.base(),
        expiresOn: expires,
        success_redirect_url: `${this.opts.appUrl}/settings?connected=${channel}`,
        failure_redirect_url: `${this.opts.appUrl}/settings?connected=failed`,
        name: `simplesequence:${channel}`,
      }),
    })) as { url?: string };
    if (!body.url) throw new Error("Unipile hosted auth did not return a url");
    return body.url;
  }

  async listAccounts(): Promise<UnipileAccount[]> {
    const body = (await this.request("/api/v1/accounts")) as { items?: UnipileAccount[] } | UnipileAccount[];
    if (Array.isArray(body)) return body;
    return body.items ?? [];
  }

  async lookupProfile(input: { profileUrl: string; accountId?: string }): Promise<{
    name?: string;
    headline?: string;
    profileUrl?: string;
  }> {
    const slug = this.slugFromProfileUrl(input.profileUrl);
    const q = input.accountId ? `?account_id=${encodeURIComponent(input.accountId)}` : "";
    const profile = (await this.request(`/api/v1/users/${encodeURIComponent(slug)}${q}`)) as {
      name?: string;
      headline?: string;
      public_profile_url?: string;
    };
    return {
      name: profile.name,
      headline: profile.headline,
      profileUrl: profile.public_profile_url ?? input.profileUrl,
    };
  }

  private slugFromProfileUrl(profileUrl: string): string {
    const n = profileUrl.trim();
    try {
      const url = /^https?:\/\//i.test(n) ? new URL(n) : new URL(`https://${n}`);
      const parts = url.pathname.split("/").filter(Boolean);
      const inIdx = parts.findIndex((p) => p.toLowerCase() === "in");
      const slug = inIdx >= 0 ? parts[inIdx + 1] : parts[parts.length - 1];
      return decodeURIComponent(slug ?? "").replace(/\/+$/, "");
    } catch {
      return n.replace(/\/+$/, "").split("/").pop() ?? n;
    }
  }

  private async providerId(accountId: string, profileUrl: string): Promise<string> {
    const slug = this.slugFromProfileUrl(profileUrl);
    const profile = (await this.request(
      `/api/v1/users/${encodeURIComponent(slug)}?account_id=${encodeURIComponent(accountId)}`,
    )) as { provider_id?: string };
    if (!profile.provider_id) throw new Error(`No Unipile provider_id for ${slug}`);
    return profile.provider_id;
  }

  async invite(input: UnipileInviteInput): Promise<UnipileSendResult> {
    if (!this.opts.sendEnabled) {
      return { providerId: `dry_invite_${Date.now()}`, dryRun: true };
    }
    const providerId = await this.providerId(input.accountId, input.profileUrl);
    const body = (await this.request("/api/v1/users/invite", {
      method: "POST",
      body: JSON.stringify({
        account_id: input.accountId,
        provider_id: providerId,
        message: input.body.slice(0, 300),
        ...(input.imageUrl ? { picture_url: input.imageUrl } : {}),
      }),
    })) as { invitation_id?: string; object?: string };
    return { providerId: body.invitation_id ?? providerId, dryRun: false };
  }

  async message(input: UnipileMessageInput): Promise<UnipileSendResult> {
    if (!this.opts.sendEnabled) {
      return { providerId: `dry_msg_${Date.now()}`, dryRun: true };
    }
    const providerId = await this.providerId(input.accountId, input.profileUrl);
    const form = new FormData();
    form.set("account_id", input.accountId);
    form.set("text", input.body);
    form.set("attendees_ids", providerId);
    if (input.imageUrl) {
      const img = await fetch(input.imageUrl);
      if (img.ok) form.set("attachments", await img.blob(), "image.jpg");
    }
    const res = await fetch(`${this.base()}/api/v1/chats`, {
      method: "POST",
      headers: { accept: "application/json", "X-API-KEY": this.apiKey },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Unipile ${res.status} /api/v1/chats: ${text.slice(0, 400)}`);
    const parsed = text ? (JSON.parse(text) as { id?: string; chat_id?: string }) : {};
    return { providerId: parsed.id ?? parsed.chat_id ?? providerId, dryRun: false };
  }

  async sendEmail(input: UnipileEmailInput): Promise<UnipileSendResult> {
    if (!this.opts.sendEnabled) {
      return { providerId: `dry_email_${Date.now()}`, dryRun: true };
    }
    const body = (await this.request("/api/v1/emails", {
      method: "POST",
      body: JSON.stringify({
        account_id: input.accountId,
        subject: input.subject,
        body: input.body,
        to: [{ identifier: input.to }],
      }),
    })) as { id?: string; tracking_id?: string };
    return { providerId: body.id ?? body.tracking_id ?? `email_${Date.now()}`, dryRun: false };
  }
}
