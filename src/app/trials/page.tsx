"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/Toggle";
import { useSettings } from "@/lib/client/tabCaches";

type TrialRow = {
  url: string;
  at: string;
  sent: boolean;
  restricted: boolean;
  throttled: boolean;
  quota: boolean;
  dryRun: boolean;
  error: string | null;
};

function detectedUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /linkedin\.com\/in\//i.test(line));
}

export default function TrialsPage() {
  const { data } = useSettings();
  const [action, setAction] = useState<"connection" | "message">("connection");
  const [seconds, setSeconds] = useState(30);
  const [urlsText, setUrlsText] = useState("");
  const [body, setBody] = useState("");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<TrialRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);

  const sandbox = Boolean(data?.settings?.sandbox);
  const sender = data?.settings?.senders?.find((s) => s.channel === "linkedin");
  const restricted = sender?.status === "restricted";

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function stop() {
    runningRef.current = false;
    setRunning(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  async function sendNext(urls: string[]) {
    if (!runningRef.current) return;
    const url = urls[indexRef.current];
    if (!url) {
      stop();
      return;
    }
    const res = await fetch("/api/trials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, url, body }),
    });
    const row = (await res.json()) as TrialRow & { error?: string };
    if (!res.ok) {
      setError(row.error ?? "Trial send failed");
      stop();
      return;
    }
    setLog((current) => [
      {
        url,
        at: new Date().toISOString(),
        sent: Boolean(row.sent),
        restricted: Boolean(row.restricted),
        throttled: Boolean(row.throttled),
        quota: Boolean(row.quota),
        dryRun: Boolean(row.dryRun),
        error: row.error ?? null,
      },
      ...current,
    ]);
    if (row.restricted || row.throttled || row.quota) {
      stop();
      return;
    }
    indexRef.current += 1;
    if (indexRef.current >= urls.length) {
      stop();
      return;
    }
    timerRef.current = setTimeout(() => void sendNext(urls), Math.max(1, seconds) * 1000);
  }

  function start() {
    const urls = detectedUrls(urlsText);
    setError(null);
    if (!urls.length) {
      setError("Paste at least one LinkedIn profile URL.");
      return;
    }
    if (restricted) {
      setError("This sender is restricted. Connect another account in Settings.");
      return;
    }
    indexRef.current = 0;
    runningRef.current = true;
    setRunning(true);
    setLog([]);
    void sendNext(urls);
  }

  const sent = log.filter((row) => row.sent).length;
  const failed = log.filter((row) => !row.sent && !row.restricted && !row.throttled && !row.quota).length;
  const hitRestrict = log.some((row) => row.restricted) || restricted;
  const hitThrottle = log.some((row) => row.throttled);
  const hitQuota = log.some((row) => row.quota);

  return (
    <AppShell>
      <h1 className="text-3xl">Developer trial</h1>
      <p className="mt-2 max-w-2xl text-(--muted)">
        Fire real LinkedIn actions at a set pace and stop on invite limit, throttle, or restrict.
        This does not create LinkedIn accounts. Connect the next one in Settings yourself.
      </p>
      {sandbox ? (
        <p className="mt-3 rounded border border-(--line) bg-(--panel) px-3 py-2 text-sm">
          Sandbox is on — these are dry-runs, not live LinkedIn sends. Turn sandbox off in Settings
          to test a live restrict.
        </p>
      ) : null}
      {hitRestrict ? (
        <p className="mt-3 text-sm text-(--danger)">
          Restricted. Sending stopped.{" "}
          <Link href="/settings" className="underline">
            Connect another account in Settings
          </Link>
          .
        </p>
      ) : null}
      {hitThrottle && !hitRestrict ? (
        <p className="mt-3 text-sm text-(--ochre)">
          Stopped — LinkedIn asked us to wait. Resume a sequence after you check LinkedIn.
        </p>
      ) : null}
      {hitQuota && !hitRestrict && !hitThrottle ? (
        <p className="mt-3 text-sm">Invite limit — this one waits.</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-(--danger)">{error}</p> : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-(--line) bg-(--panel) p-4">
          <label className="block text-sm text-(--muted)">
            Action
            <select
              className="mt-1 block w-full rounded border border-(--line) bg-(--input) px-3 py-2"
              value={action}
              disabled={running}
              onChange={(e) => setAction(e.target.value as "connection" | "message")}
            >
              <option value="connection">Connection</option>
              <option value="message">Message</option>
            </select>
          </label>
          <label className="mt-4 block text-sm text-(--muted)">
            Seconds between actions
            <input
              type="number"
              min={1}
              className="mt-1 block w-32 rounded border border-(--line) bg-(--input) px-3 py-2"
              value={seconds}
              disabled={running}
              onChange={(e) => setSeconds(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label className="mt-4 block text-sm text-(--muted)">
            Message (optional)
            <textarea
              className="mt-1 h-24 w-full rounded border border-(--line) bg-(--input) p-3 text-sm"
              value={body}
              disabled={running}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
        </div>
        <div className="rounded-lg border border-(--line) bg-(--panel) p-4">
          <label className="block text-sm text-(--muted)">
            LinkedIn profile URLs
            <textarea
              className="mt-1 h-48 w-full rounded border border-(--line) bg-(--input) p-3 font-mono text-sm"
              placeholder={"https://www.linkedin.com/in/priya-rao\nhttps://www.linkedin.com/in/matt-cole"}
              value={urlsText}
              disabled={running}
              onChange={(e) => setUrlsText(e.target.value)}
            />
          </label>
          <p className="mt-2 text-sm text-(--muted)">{detectedUrls(urlsText).length} URLs</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {running ? (
          <button type="button" className="btn-danger rounded-full px-4 py-2" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="button" className="btn-primary rounded-full px-4 py-2" onClick={start}>
            Start
          </button>
        )}
        <Link href="/settings" className="rounded-full border border-(--line) px-4 py-2 text-sm">
          Settings
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <StatusBadge
          tone={running ? "wait" : hitRestrict ? "danger" : hitThrottle ? "wait" : "muted"}
        >
          {running ? "running" : hitRestrict ? "restricted" : hitThrottle ? "stopped" : "idle"}
        </StatusBadge>
        <span>sent {sent}</span>
        <span>failed {failed}</span>
        <span>restricted {hitRestrict ? 1 : 0}</span>
      </div>

      <ul className="mt-4 space-y-2">
        {log.map((row, index) => (
          <li key={`${row.at}-${index}`} className="rounded-2xl border border-(--line) bg-(--panel) px-4 py-3 text-sm">
            <span className="text-(--muted)">{row.at}</span>
            {" · "}
            {row.restricted
              ? "restricted"
              : row.throttled
                ? "stopped"
                : row.quota
                  ? "invite limit"
                  : row.sent
                    ? row.dryRun
                      ? "dry-run"
                      : "sent"
                    : "failed"}
            {" · "}
            <span className="break-all">{row.url}</span>
            {row.error ? <p className="mt-1 text-(--danger)">{row.error}</p> : null}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
