"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/Toggle";
import { linkedInProfileHref } from "@/lib/domain/linkedinProfile";

type Frequency = {
  account: {
    id: string;
    displayName: string;
    profileUrl: string | null;
    status: string;
    signal: "throttled" | "restricted" | null;
  } | null;
  connectionsUsed: number;
  connectionCap: number;
  minGapMinutes: number;
  lastActionLabel: string | null;
  gapOpen: boolean;
  nextCheckLabel: string;
};

export default function FrequencyPage() {
  const [data, setData] = useState<Frequency | null>(null);
  const [cap, setCap] = useState("25");
  const [gap, setGap] = useState("2");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/frequency")
      .then((res) => res.json())
      .then((body: Frequency) => {
        setData(body);
        setCap(String(body.connectionCap));
        setGap(String(body.minGapMinutes));
      })
      .catch(() => setError("Could not load Frequency."));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/frequency", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        connectionCap: Number(cap),
        minGapMinutes: Number(gap),
      }),
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(body.error ?? "Could not save.");
      return;
    }
    setData(body);
    setCap(String(body.connectionCap));
    setGap(String(body.minGapMinutes));
  }

  const profile = data?.account ? linkedInProfileHref(data.account.profileUrl) : null;
  const signal = data?.account?.signal;

  return (
    <AppShell>
      <h1 className="text-2xl">Frequency</h1>
      <p className="mt-2 max-w-2xl text-sm text-(--muted)">
        The shared account budget. Saving changes the cap and the gap for the next check. It does not send.
      </p>

      {!data ? (
        <p className="mt-6">Loading…</p>
      ) : (
        <>
          <section className="mt-6 rounded-lg border border-(--line) bg-(--panel) p-4">
            <p className="text-xs uppercase tracking-wide text-(--muted)">Account</p>
            {data.account ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="font-medium">{data.account.displayName}</p>
                <StatusBadge tone={signal === "restricted" ? "danger" : signal === "throttled" ? "wait" : "ok"}>
                  {signal === "restricted" ? "Restricted" : signal === "throttled" ? "Slowed" : data.account.status}
                </StatusBadge>
                {profile ? (
                  <a href={profile} className="text-sm text-(--ochre)" target="_blank" rel="noreferrer">
                    {profile.replace("https://www.", "")}
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm">
                No LinkedIn account is selected. Connect one in <Link href="/settings">Settings</Link>.
              </p>
            )}
            {signal === "restricted" ? (
              <p className="mt-3 text-sm">LinkedIn has restricted this account. Frequency does not clear that.</p>
            ) : null}
            {signal === "throttled" ? (
              <p className="mt-3 text-sm">LinkedIn has slowed this account. Frequency does not clear that.</p>
            ) : null}
          </section>

          <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-(--line) bg-(--line) sm:grid-cols-3">
            <div className="bg-(--paper) px-4 py-3">
              <p className="text-xs text-(--muted)">Connections</p>
              <p className="mt-1 text-xl">
                {data.connectionsUsed} of {data.connectionCap}
              </p>
              <p className="mt-1 text-xs text-(--muted)">Last 24 hours</p>
            </div>
            <div className="bg-(--paper) px-4 py-3">
              <p className="text-xs text-(--muted)">Gap</p>
              <p className="mt-1 text-xl">{data.minGapMinutes} min</p>
              <p className="mt-1 text-xs text-(--muted)">
                {data.lastActionLabel
                  ? `Last action ${data.lastActionLabel}. ${data.gapOpen ? "The gap is clear." : "Waiting out the gap."}`
                  : "No action yet."}
              </p>
            </div>
            <div className="bg-(--paper) px-4 py-3">
              <p className="text-xs text-(--muted)">Next check</p>
              <p className="mt-1 text-xl">{data.nextCheckLabel}</p>
              <p className="mt-1 text-xs text-(--muted)">The worker runs once a day.</p>
            </div>
          </div>

          <section className="mt-6 rounded-lg border border-(--line) bg-(--panel) p-4">
            <h2 className="text-xl">Tune</h2>
            <div className="mt-4 flex flex-wrap gap-6">
              <label className="text-sm">
                Connection cap
                <input
                  type="number"
                  min={0}
                  max={1000}
                  className="mt-2 block w-28 rounded-md border border-(--line) bg-(--paper) px-3 py-2"
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                />
                <span className="mt-1 block text-(--muted)">In the last 24 hours</span>
              </label>
              <label className="text-sm">
                Minimum gap
                <input
                  type="number"
                  min={0}
                  max={1440}
                  className="mt-2 block w-28 rounded-md border border-(--line) bg-(--paper) px-3 py-2"
                  value={gap}
                  onChange={(e) => setGap(e.target.value)}
                />
                <span className="mt-1 block text-(--muted)">Minutes between actions</span>
              </label>
            </div>
            <button
              type="button"
              disabled={saving}
              className="btn-primary mt-4 rounded-full px-4 py-2 disabled:opacity-40"
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <p className="mt-3 max-w-xl text-sm text-(--muted)">
              One action still goes out per check. LinkedIn can still restrict the account.
            </p>
            {error ? <p className="mt-3 text-sm text-(--danger)">{error}</p> : null}
          </section>
        </>
      )}
    </AppShell>
  );
}
