import { profileUrlFromLinkedInAccount } from "../domain/linkedinProfile";

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
  connection_params?: {
    mail?: string;
    im?: string | { publicIdentifier?: string; username?: string };
  };
};

export function channelFromUnipileAccount(account: UnipileAccount): "linkedin" | null {
  const blob = [account.type, account.provider, ...(account.sources ?? [])].filter(Boolean).join(" ").toUpperCase();
  if (blob.includes("LINKEDIN")) return "linkedin";
  return null;
}

export type HostedAuthOpts = {
  type?: "create" | "reconnect";
  reconnectAccount?: string;
};

export type UnipilePort = {
  hostedAuthUrl(channel: "linkedin", opts?: HostedAuthOpts): Promise<string>;
  invite(input: UnipileInviteInput): Promise<UnipileSendResult>;
  message(input: UnipileMessageInput): Promise<UnipileSendResult>;
  listAccounts?(): Promise<UnipileAccount[]>;
  ownProfile?(accountId: string): Promise<{ name?: string; profileUrl?: string }>;
  lookupProfile?(input: { profileUrl: string; accountId?: string }): Promise<{
    firstName?: string;
    lastName?: string;
    name?: string;
    headline?: string;
    title?: string;
    company?: string;
    location?: string;
    about?: string;
    profileUrl?: string;
  }>;
};

export class MockUnipile implements UnipilePort {
  readonly calls: Array<{ kind: string; input: unknown }> = [];

  async hostedAuthUrl(channel: "linkedin", opts?: HostedAuthOpts): Promise<string> {
    this.calls.push({ kind: "hostedAuth", input: { channel, ...opts } });
    const type = opts?.type ?? "create";
    const reconnect = opts?.reconnectAccount ? `&reconnect=${opts.reconnectAccount}` : "";
    return `https://unipile.example/hosted-auth?channel=${channel}&type=${type}${reconnect}`;
  }

  async invite(input: UnipileInviteInput): Promise<UnipileSendResult> {
    this.calls.push({ kind: "invite", input });
    return { providerId: `mock_invite_${this.calls.length}`, dryRun: true };
  }

  async message(input: UnipileMessageInput): Promise<UnipileSendResult> {
    this.calls.push({ kind: "message", input });
    return { providerId: `mock_msg_${this.calls.length}`, dryRun: true };
  }

  async listAccounts(): Promise<UnipileAccount[]> {
    return [];
  }

  async ownProfile(accountId: string): Promise<{ name?: string; profileUrl?: string }> {
    this.calls.push({ kind: "ownProfile", input: { accountId } });
    return { name: "Sandbox LinkedIn", profileUrl: `https://www.linkedin.com/in/${accountId}` };
  }

  async lookupProfile(input: { profileUrl: string }): Promise<{
    firstName?: string;
    lastName?: string;
    name?: string;
    headline?: string;
    title?: string;
    company?: string;
    location?: string;
    about?: string;
    profileUrl?: string;
  }> {
    this.calls.push({ kind: "lookup", input });
    const slug = input.profileUrl.split("/").filter(Boolean).pop()?.replace(/\?.*$/, "") ?? "profile";
    const parts = slug.split("-").filter((p) => p && !/^\d+$/.test(p));
    const titled = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
    const firstName = titled[0] ?? "Person";
    const lastName = titled.slice(1).join(" ");
    const name = [firstName, lastName].filter(Boolean).join(" ");
    return {
      firstName,
      lastName,
      name,
      headline: `Operator at Example`,
      title: "Operator",
      company: "Example",
      location: "Example City",
      about: "Builds sequences for operators.",
      profileUrl: input.profileUrl,
    };
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

  async hostedAuthUrl(channel: "linkedin", opts?: HostedAuthOpts): Promise<string> {
    const type = opts?.type ?? "create";
    if (type === "reconnect" && !opts?.reconnectAccount) {
      throw new Error("Unipile reconnect needs an account id");
    }
    const expires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const body = (await this.request("/api/v1/hosted/accounts/link", {
      method: "POST",
      body: JSON.stringify({
        type,
        providers: ["LINKEDIN"],
        api_url: this.base(),
        expiresOn: expires,
        success_redirect_url: `${this.opts.appUrl}/settings?connected=${channel}`,
        failure_redirect_url: `${this.opts.appUrl}/settings?connected=failed`,
        ...(type === "reconnect"
          ? { reconnect_account: opts!.reconnectAccount }
          : { name: `simplesequence:${channel}:${Date.now()}` }),
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

  async ownProfile(accountId: string): Promise<{ name?: string; profileUrl?: string }> {
    const accounts = await this.listAccounts();
    const account = accounts.find((row) => row.id === accountId);
    if (!account) throw new Error("LinkedIn account was not in the Unipile account list");
    const profileUrl = profileUrlFromLinkedInAccount(account);
    if (!profileUrl) {
      const im = account.connection_params?.im;
      const detail =
        im && typeof im === "object" ? Object.keys(im).join(",") : im ? "string" : "missing";
      throw new Error(`no public LinkedIn identifier (${detail})`);
    }
    return { name: account.name, profileUrl };
  }

  async lookupProfile(input: { profileUrl: string; accountId?: string }): Promise<{
    firstName?: string;
    lastName?: string;
    name?: string;
    headline?: string;
    title?: string;
    company?: string;
    location?: string;
    about?: string;
    profileUrl?: string;
  }> {
    const slug = this.slugFromProfileUrl(input.profileUrl);
    const profile = await this.fetchUserProfile(slug, input.accountId);
    const jobs = profile.work_experience ?? [];
    const current = jobs.find((job) => job.current || job.end == null) ?? jobs[0];
    const company = typeof current?.company === "string" ? current.company : current?.company?.text;
    const title =
      current?.position ||
      (typeof current?.job_title === "string" ? current.job_title : current?.job_title?.text);
    return {
      firstName: profile.first_name,
      lastName: profile.last_name,
      name: profile.name || [profile.first_name, profile.last_name].filter(Boolean).join(" "),
      headline: profile.headline,
      title,
      company,
      location: profile.location,
      about: profile.summary,
      profileUrl: profile.public_profile_url ?? input.profileUrl,
    };
  }

  private async fetchUserProfile(
    slug: string,
    accountId?: string,
  ): Promise<{
    first_name?: string;
    last_name?: string;
    name?: string;
    headline?: string;
    location?: string;
    summary?: string;
    public_profile_url?: string;
    work_experience?: Array<{
      position?: string;
      company?: string | { text?: string };
      job_title?: string | { text?: string };
      current?: boolean;
      end?: string | null;
    }>;
  }> {
    const withAccount = (extra: Record<string, string>) => {
      const params = new URLSearchParams(extra);
      if (accountId) params.set("account_id", accountId);
      return params.toString();
    };
    try {
      return (await this.request(
        `/api/v1/users/${encodeURIComponent(slug)}?${withAccount({ linkedin_sections: "experience" })}`,
      )) as Awaited<ReturnType<LiveUnipile["fetchUserProfile"]>>;
    } catch {
      return (await this.request(
        `/api/v1/users/${encodeURIComponent(slug)}?${withAccount({})}`,
      )) as Awaited<ReturnType<LiveUnipile["fetchUserProfile"]>>;
    }
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
}
