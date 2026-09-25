"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatusBadge } from "@/components/Toggle";
import { frequencyCategories } from "@/lib/domain/linkedinFrequency";
import { planLabel } from "@/lib/domain/linkedinPlan";

const LEVELS = ["normal", "premium", "sales_navigator", "recruiter"] as const;
import { statusLabel } from "@/lib/ui/display";
import { linkedInProfileHref } from "@/lib/domain/linkedinProfile";

type FrequencyCategory = {
  id: string;
  label: string;
  day: number;
  week: number;
  month: number;
  usedDay: number;
  usedWeek: number;
  usedMonth: number;
  averageGapMinutes: number | null;
};

function gapLabel(minutes: number | null): string | null {
  if (minutes == null) return null;
  if (minutes < 90) return `About every ${minutes} minutes, varied at random`;
  return `About every ${Math.round(minutes / 6) / 10} hours, varied at random`;
}

type Frequency = {
  account: {
    id: string;
    displayName: string;
    profileUrl: string | null;
    status: string;
    signal: "throttled" | "restricted" | null;
    linkedinPlan?: string | null;
  } | null;
  categories: FrequencyCategory[];
  minGapMinutes: number;
  lastActionLabel: string | null;
  gapOpen: boolean;
  processed?: number;
};

export default function FrequencyPage() {
  const [data, setData] = useState<Frequency | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void fetch("/api/frequency")
      .then((res) => res.json())
      .then((body: Frequency) => {
        setData(body);
      })
      .catch(() => setError("Could not load Frequency."));
  }, []);

  async function checkNow() {
    setChecking(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/frequency/check", { method: "POST" });
    const body = await res.json();
    setChecking(false);
    if (!res.ok) {
      setError(typeof body.error === "string" ? body.error : "Could not check.");
      return;
    }
    setData(body);
    setNotice(body.processed > 0 ? "Sent the next action." : "No action was ready.");
  }

  const profile = data?.account ? linkedInProfileHref(data.account.profileUrl) : null;
  const signal = data?.account?.signal;

  return (
    <AppShell>
      <PageHeader
        title="Frequency"
        lede="How many of each action this account can send. The day, week, and month are set for this LinkedIn level. Check now sends the next due action once."
      />

      {!data ? (
        <p className="mt-6 text-sm text-(--muted)">Loading…</p>
      ) : (
        <>
          <section className="card mt-6 p-5">
            <p className="eyebrow">Account</p>
            {data.account ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="font-medium">{data.account.displayName}</p>
                <StatusBadge tone={signal === "restricted" ? "danger" : signal === "throttled" ? "wait" : "ok"}>
                  {signal === "restricted" ? "Restricted" : signal === "throttled" ? "Slowed" : statusLabel(data.account.status)}
                </StatusBadge>
                {profile ? (
                  <a href={profile} className="text-sm text-(--ochre) hover:underline" target="_blank" rel="noreferrer">
                    {profile.replace("https://www.", "")}
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm">
                No LinkedIn account is selected. Connect one in{" "}
                <Link href="/settings" className="text-(--ochre) hover:underline">
                  Settings
                </Link>
                .
              </p>
            )}
            {signal === "restricted" ? (
              <p className="mt-3 text-sm">LinkedIn has restricted this account. Changing the limits here does not clear that.</p>
            ) : null}
            {signal === "throttled" ? (
              <p className="mt-3 text-sm">LinkedIn has slowed this account. Changing the limits here does not clear that.</p>
            ) : null}
          </section>

          <section className="card mt-6 p-5">
            <h2 className="text-lg">Suggested amounts</h2>
            <p className="mt-1 text-sm text-(--muted)">
              {planLabel(data.account?.linkedinPlan)} account. These amounts are set for that level.
            </p>
            <div className="mt-4 overflow-x-auto">
              <div className="grid min-w-[32rem] grid-cols-4 gap-3 text-xs text-(--muted)">
                <span>Action</span>
                <span>Day</span>
                <span>Week</span>
                <span>Month</span>
              </div>
              {data.categories.map((row) => {
                const blocked = row.day === 0 && row.week === 0 && row.month === 0;
                return (
                  <div key={row.id} className="mt-3 grid min-w-[32rem] grid-cols-4 gap-3 border-t border-(--line) pt-3 text-sm">
                    <div>
                      <p className="font-medium">{row.label}</p>
                      {!blocked && gapLabel(row.averageGapMinutes) ? (
                        <p className="mt-0.5 text-xs text-(--muted)">{gapLabel(row.averageGapMinutes)}</p>
                      ) : null}
                    </div>
                    {blocked ? (
                      <p className="col-span-3 text-(--muted)">This account does not send this.</p>
                    ) : (
                      <>
                        <p>
                          {row.usedDay} of {row.day}
                        </p>
                        <p>
                          {row.usedWeek} of {row.week}
                        </p>
                        <p>
                          {row.usedMonth} of {row.month}
                        </p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card mt-6 p-5">
            <h2 className="text-lg">Suggested amounts by level</h2>
            <p className="mt-1 text-sm text-(--muted)">Each amount reads day · week · month. This account’s level is highlighted.</p>
            <div className="mt-4 overflow-x-auto">
              <div className="grid min-w-[40rem] grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] gap-3 text-xs text-(--muted)">
                <span>Action</span>
                {LEVELS.map((level) => (
                  <span key={level} className={level === (data.account?.linkedinPlan ?? "normal") ? "font-semibold text-(--ochre)" : ""}>
                    {planLabel(level)}
                  </span>
                ))}
              </div>
              {frequencyCategories("normal").map((base) => (
                <div
                  key={base.id}
                  className="mt-3 grid min-w-[40rem] grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] gap-3 border-t border-(--line) pt-3 text-sm"
                >
                  <p className="font-medium">{base.label}</p>
                  {LEVELS.map((level) => {
                    const row = frequencyCategories(level).find((item) => item.id === base.id);
                    const none = !row || (row.day === 0 && row.week === 0 && row.month === 0);
                    return (
                      <p key={level} className={none ? "text-(--muted)" : ""}>
                        {none ? "Does not send" : `${row.day} · ${row.week} · ${row.month}`}
                      </p>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>

          <section className="card mt-6 p-5">
            <h2 className="text-lg">Check</h2>
            <p className="mt-2 text-sm text-(--muted)">
              Each kind of action waits a random gap, sized so the day’s amount is spread across 24 hours. Any two actions
              are at least {data.minGapMinutes} minutes apart.
              {data.lastActionLabel
                ? ` Last action ${data.lastActionLabel}. ${data.gapOpen ? "The gap is clear." : "Waiting out the gap."}`
                : " No action yet."}
            </p>
            <button
              type="button"
              disabled={checking}
              className="btn btn-primary mt-4"
              onClick={() => void checkNow()}
            >
              {checking ? "Checking…" : "Check now"}
            </button>
            <p className="mt-3 max-w-xl text-sm text-(--muted)">One action goes out per check, while that action’s amount has room.</p>
            {notice ? <p className="mt-3 text-sm text-(--ok)">{notice}</p> : null}
            {error ? <p className="mt-3 text-sm text-(--danger)">{error}</p> : null}
          </section>
        </>
      )}
    </AppShell>
  );
}
