"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/Toggle";
import { formatWhen } from "@/lib/ui/display";

type Sender = {
  id: string;
  displayName: string;
  status: string;
  lastError?: string | null;
  autoLogin?: boolean;
  lastLoginAt?: string | null;
};

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  return body as { error?: string; code?: string; ok?: boolean; detail?: string };
}

export function AutoLogin({
  sender,
  available,
  onChanged,
}: {
  sender: Sender;
  available: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await work();
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", async () => {
      const res = await fetch("/api/accounts/linkedin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ senderId: sender.id, username, password, totpSecret: secret }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        setError(body.error ?? "Could not save the login.");
        return;
      }
      setPassword("");
      setSecret("");
      setCode(body.code ?? null);
      setNotice("Saved. Enter the code below in LinkedIn to finish turning on the authenticator app.");
      await onChanged();
    });

  const showCode = () =>
    run("code", async () => {
      const res = await fetch(`/api/accounts/linkedin/login?senderId=${encodeURIComponent(sender.id)}`);
      const body = await readJson(res);
      if (!res.ok) {
        setError(body.error ?? "Could not make a code.");
        return;
      }
      setCode(body.code ?? null);
    });

  const loginNow = () =>
    run("now", async () => {
      const res = await fetch("/api/accounts/linkedin/login/now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ senderId: sender.id }),
      });
      const body = await readJson(res);
      if (!res.ok) setError(body.error ?? "Could not log in.");
      else if (body.ok) setNotice(body.detail ?? "Logged in.");
      else setError(body.detail ?? "LinkedIn did not finish the login.");
      await onChanged();
    });

  const remove = () =>
    run("remove", async () => {
      const res = await fetch("/api/accounts/linkedin/login", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ senderId: sender.id }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        setError(body.error ?? "Could not remove the login.");
        return;
      }
      setCode(null);
      setNotice("Removed. A logout now needs Reconnect.");
      await onChanged();
    });

  return (
    <section className="card mt-6 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg">Automatic login</h2>
        <StatusBadge tone={sender.autoLogin ? "ok" : "off"}>{sender.autoLogin ? "On" : "Off"}</StatusBadge>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-(--muted)">
        If LinkedIn logs {sender.displayName} out, SimpleSequence logs back in with this login and answers the 2FA code
        itself. Sending waits while it is logged out, and nobody is marked failed. The login is stored encrypted and is
        never shown again.
      </p>

      {!available ? (
        <p className="mt-4 text-sm text-(--muted)">Automatic login is not set up on this site yet.</p>
      ) : sender.autoLogin ? (
        <div className="mt-4">
          {sender.status === "disconnected" ? (
            <p className="text-sm text-(--danger)">
              Logged out.{" "}
              {sender.lastError && sender.lastError !== "provider_disconnected" ? sender.lastError : "Logging back in."}
            </p>
          ) : null}
          {sender.lastLoginAt ? (
            <p className="mt-1 text-sm text-(--muted)">Last automatic login {formatWhen(sender.lastLoginAt)}.</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(busy)} className="btn btn-primary" onClick={() => void loginNow()}>
              {busy === "now" ? "Logging in…" : "Log in now"}
            </button>
            <button type="button" disabled={Boolean(busy)} className="btn btn-quiet" onClick={() => void showCode()}>
              {busy === "code" ? "Making…" : "Show 2FA code"}
            </button>
            <button type="button" disabled={Boolean(busy)} className="btn btn-quiet-danger" onClick={() => void remove()}>
              {busy === "remove" ? "Removing…" : "Remove login"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 max-w-xl">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-(--muted)">
            <li>
              In LinkedIn, open Settings, then Sign in &amp; security, then Two-step verification. Choose Authenticator app.
            </li>
            <li>LinkedIn shows a setup key. Copy it, and leave that LinkedIn page open.</li>
            <li>Paste the key below with the LinkedIn email and password, then Save.</li>
            <li>Type the code SimpleSequence shows into LinkedIn to finish.</li>
          </ol>
          <label className="label mt-4 block">
            LinkedIn email
            <input className="field mt-1.5" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="label mt-3 block">
            LinkedIn password
            <input
              className="field mt-1.5"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="label mt-3 block">
            Authenticator setup key
            <input
              className="field mt-1.5 font-mono"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={Boolean(busy) || !username || !password || !secret}
            className="btn btn-primary mt-4"
            onClick={() => void save()}
          >
            {busy === "save" ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {code ? (
        <div className="stat-grid mt-4 max-w-xs grid-cols-1">
          <div>
            <p className="text-xs text-(--muted)">2FA code</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-widest">{code}</p>
            <p className="mt-1 text-xs text-(--muted)">Changes every 30 seconds.</p>
          </div>
        </div>
      ) : null}
      {notice ? <p className="mt-3 text-sm text-(--ok)">{notice}</p> : null}
      {error ? <p className="mt-3 text-sm text-(--danger)">{error}</p> : null}
    </section>
  );
}
