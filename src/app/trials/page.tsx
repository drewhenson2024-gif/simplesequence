"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/Toggle";
import { useSettings } from "@/lib/client/tabCaches";

type TrialEventView = {
  id: string;
  url: string;
  at: string;
  sent: boolean;
  restricted: boolean;
  throttled: boolean;
  quota: boolean;
  dryRun: boolean;
  error: string | null;
};

type TrialRunView = {
  id: string;
  status: string;
  action: "connection" | "message";
  intervalSeconds: number;
  body: string;
  urls: string[];
  nextIndex: number;
  sent: number;
  failed: number;
  dryRun: boolean;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  events: TrialEventView[];
};

function detectedUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /linkedin\.com\/in\//i.test(line));
}

function outcomeLabel(status: string) {
  if (status === "restricted") return "restricted";
  if (status === "throttled") return "stopped";
  if (status === "quota") return "invite limit";
  if (status === "finished") return "finished";
  if (status === "stopped") return "stopped";
  if (status === "running") return "running";
  return status;
}

function eventLabel(row: TrialEventView) {
  if (row.restricted) return "restricted";
  if (row.throttled) return "stopped";
  if (row.quota) return "invite limit";
  if (row.sent) return row.dryRun ? "dry-run" : "sent";
  return "failed";
}

export default function TrialsPage() {
  const { data, loaded } = useSettings();
  const trialOn = Boolean(data?.settings?.developerTrial ?? data?.settings?.workspace?.developerTrial);
  const sandbox = Boolean(data?.settings?.sandbox);
  const sender = data?.settings?.senders?.find((s) => s.channel === "linkedin");
  const restricted = sender?.status === "restricted";

  const [action, setAction] = useState<"connection" | "message">("connection");
  const [seconds, setSeconds] = useState(30);
  const [urlsText, setUrlsText] = useState("");
  const [body, setBody] = useState("");
  const [runs, setRuns] = useState<TrialRunView[]>([]);
  const [current, setCurrent] = useState<TrialRunView | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runIdRef = useRef<string | null>(null);

  const running = current?.status === "running";
  const selected = runs.find((run) => run.id === selectedId) ?? null;

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!trialOn) return;
    void (async () => {
      const res = await fetch("/api/trials");
      const json = (await res.json()) as { runs?: TrialRunView[] };
      const list = Array.isArray(json.runs) ? json.runs : [];
      const open = list.find((run) => run.status === "running");
      if (open) {
        const stopped = await fetch("/api/trials", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ op: "stop", runId: open.id }),
        });
        if (stopped.ok) {
          const after = await fetch("/api/trials");
          const next = (await after.json()) as { runs?: TrialRunView[] };
          setRuns(Array.isArray(next.runs) ? next.runs : list);
          return;
        }
      }
      setRuns(list);
    })();
  }, [trialOn]);

  function clearTimer() {
    runningRef.current = false;
    runIdRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  async function tick(runId: string, wait = 0) {
    if (!runningRef.current || runIdRef.current !== runId) return;
    timerRef.current = setTimeout(async () => {
      if (!runningRef.current || runIdRef.current !== runId) return;
      const res = await fetch("/api/trials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "tick", runId }),
      });
      const json = (await res.json()) as { run?: TrialRunView; error?: string };
      if (!res.ok || !json.run) {
        setError(json.error ?? "Trial send failed");
        clearTimer();
        return;
      }
      setCurrent(json.run);
      setRuns((list) => [json.run!, ...list.filter((row) => row.id !== json.run!.id)]);
      if (json.run.status !== "running") {
        clearTimer();
        return;
      }
      void tick(runId, json.run.intervalSeconds * 1000);
    }, wait);
  }

  async function start() {
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
    const res = await fetch("/api/trials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "start", action, intervalSeconds: seconds, urls, body }),
    });
    const json = (await res.json()) as TrialRunView & { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not start trial");
      return;
    }
    setSelectedId(null);
    setCurrent(json);
    setRuns((list) => [json, ...list.filter((row) => row.id !== json.id)]);
    runningRef.current = true;
    runIdRef.current = json.id;
    void tick(json.id, 0);
  }

  async function stop() {
    const runId = current?.id ?? runIdRef.current;
    clearTimer();
    if (!runId) return;
    const res = await fetch("/api/trials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "stop", runId }),
    });
    const json = (await res.json()) as TrialRunView & { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not stop trial");
      return;
    }
    setCurrent(json);
    setRuns((list) => [json, ...list.filter((row) => row.id !== json.id)]);
  }

  if (!loaded) {
    return (
      <AppShell>
        <p>Loading…</p>
      </AppShell>
    );
  }

  if (!trialOn) {
    return (
      <AppShell>
        <h1 className="text-3xl">Developer trial</h1>
        <p className="mt-3 max-w-xl text-(--muted)">
          Turn this on in Settings to put Trial in the top nav and keep a history of each run.
        </p>
        <Link href="/settings" className="btn-primary mt-4 inline-flex rounded-full px-4 py-2">
          Settings
        </Link>
      </AppShell>
    );
  }

  const live = current;
  const archive = runs.filter((run) => run.status !== "running");
  const hitRestrict = live?.status === "restricted" || restricted;
  const hitThrottle = live?.status === "throttled";
  const hitQuota = live?.status === "quota";

  return (
    <AppShell>
      <h1 className="text-3xl">Developer trial</h1>
      <p className="mt-2 max-w-2xl text-(--muted)">
        Fire real LinkedIn actions at a set pace and stop on invite limit, throttle, or restrict.
        Each Start is a stored run. When it ends, it is history — start a new one. This does not
        create LinkedIn accounts.
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
          Stopped — LinkedIn asked us to wait. Start a new run after you check LinkedIn.
        </p>
      ) : null}
      {hitQuota && !hitRestrict && !hitThrottle ? (
        <p className="mt-3 text-sm">Invite limit — this run is archived. Start a new one later.</p>
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
          <button type="button" className="btn-danger rounded-full px-4 py-2" onClick={() => void stop()}>
            Stop
          </button>
        ) : (
          <button type="button" className="btn-primary rounded-full px-4 py-2" onClick={() => void start()}>
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
          {live ? outcomeLabel(live.status) : "idle"}
        </StatusBadge>
        <span>sent {live?.sent ?? 0}</span>
        <span>failed {live?.failed ?? 0}</span>
      </div>

      <ul className="mt-4 space-y-2">
        {(live?.events ?? []).slice().reverse().map((row) => (
          <li key={row.id} className="rounded-2xl border border-(--line) bg-(--panel) px-4 py-3 text-sm">
            <span className="text-(--muted)">{row.at}</span>
            {" · "}
            {eventLabel(row)}
            {" · "}
            <span className="break-all">{row.url}</span>
            {row.error ? <p className="mt-1 text-(--danger)">{row.error}</p> : null}
          </li>
        ))}
      </ul>

      <section className="mt-10">
        <h2 className="text-xl">Past trials</h2>
        <p className="mt-1 text-sm text-(--muted)">Read-only. Open a run to see the recipe and what happened.</p>
        {archive.length === 0 ? (
          <p className="mt-3 text-sm text-(--muted)">No stored runs yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {archive.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                    selectedId === run.id ? "border-(--ochre) bg-(--panel)" : "border-(--line) bg-(--panel)"
                  }`}
                  onClick={() => setSelectedId((id) => (id === run.id ? null : run.id))}
                >
                  <span className="font-medium">{run.action}</span>
                  {" · "}
                  every {run.intervalSeconds}s
                  {" · "}
                  {run.urls.length} URLs
                  {" · "}
                  sent {run.sent}
                  {" · "}
                  {outcomeLabel(run.status)}
                  <span className="mt-1 block text-(--muted)">{run.startedAt}</span>
                </button>
                {selected?.id === run.id ? (
                  <div className="mt-2 rounded-2xl border border-(--line) px-4 py-3 text-sm">
                    <p>
                      {run.action} every {run.intervalSeconds}s
                      {run.dryRun ? " · dry-run" : ""}
                      {run.endReason ? ` · ${run.endReason}` : ""}
                    </p>
                    {run.body ? <p className="mt-2 whitespace-pre-wrap text-(--muted)">{run.body}</p> : null}
                    <p className="mt-2 text-(--muted)">{run.urls.join("\n")}</p>
                    <ul className="mt-3 space-y-1">
                      {run.events.map((row) => (
                        <li key={row.id}>
                          {row.at} · {eventLabel(row)} · {row.url}
                          {row.error ? ` · ${row.error}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
