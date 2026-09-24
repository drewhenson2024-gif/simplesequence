"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { StatusBadge } from "@/components/Toggle";

type FeatureId = "sequences" | "people";

const FEATURES: Array<{
  id: FeatureId;
  title: string;
  body: string;
}> = [
  {
    id: "sequences",
    title: "Sequences that learn",
    body: "Every sequence has a stats board. Suggestions come from those numbers and save as a new draft. Nothing starts until you say so.",
  },
  {
    id: "people",
    title: "People you already know",
    body: "Paste LinkedIn profile URLs, or have your agent send them. We fill in name, title, and company from each profile.",
  },
];

const STEPS = [
  { n: "1", t: "People", d: "Paste LinkedIn profile URLs, or send them from your agent. We look up name, title, and company." },
  { n: "2", t: "Sequence", d: "A connection request, then LinkedIn messages. The pace stays conservative. The outbox shows queued, sent, skipped, and failed." },
  { n: "3", t: "Inbox", d: "See who needs a reply, and stop a person when the conversation should end. Only you press Start." },
  { n: "4", t: "Analytics", d: "See what worked. Suggestions become a new draft. Writing new copy from the stats is coming soon." },
];

export function MarketingHome() {
  const [feature, setFeature] = useState<FeatureId>("sequences");

  return (
    <div className="min-h-screen bg-(--paper)">
      <header className="sticky top-0 z-10 border-b border-(--line) bg-(--panel)/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <a href="#" aria-label="SimpleSequence">
            <Logo />
          </a>
          <nav className="hidden items-center gap-7 text-sm text-(--muted) sm:flex">
            <a href="#features" className="hover:text-(--ink)">Features</a>
            <a href="#how" className="hover:text-(--ink)">How it works</a>
            <a href="#agents" className="hover:text-(--ink)">For agents</a>
          </nav>
          <Link href="/lists" className="btn btn-primary">
            Open app
          </Link>
        </div>
      </header>

      <section className="dot-grid border-b border-(--line) bg-(--panel)">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center sm:py-28">
          <p className="inline-flex items-center gap-2 rounded-full bg-(--tint) px-3 py-1 text-xs font-medium text-(--ochre)">
            For Claude, Codex, and Cursor
          </p>
          <h1 className="mt-6 text-5xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
            LinkedIn sequences
            <br />
            for your <span className="text-(--ochre)">agents</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-(--muted)">
            Paste LinkedIn profile URLs. Your agent drafts the sequence. You press Start, and replies land in one inbox.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/lists" className="btn btn-lg btn-primary">
              Open app →
            </Link>
            <a href="#how" className="btn btn-lg btn-quiet">
              How it works
            </a>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <p className="eyebrow">Features</p>
        <h2 className="mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">Bring the people. We handle the sequence.</h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-(--muted)">
          Two places to start. Select one to see a preview of the app.
        </p>
        <div className="mt-12 grid items-stretch gap-4 md:grid-cols-2">
          {FEATURES.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={feature === f.id}
              onClick={() => setFeature(f.id)}
              className={`card card-link h-full p-6 text-left ${
                feature === f.id ? "border-(--ochre) ring-3 ring-(--tint)" : ""
              }`}
            >
              <h3 className="text-lg">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-(--muted)">{f.body}</p>
            </button>
          ))}
        </div>
        <div className="mt-6">
          <FeatureExample id={feature} />
        </div>
      </section>

      <section id="how" className="border-t border-(--line) bg-(--panel)">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 text-4xl tracking-tight sm:text-5xl">How a sequence runs</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-(--muted)">
            You bring the LinkedIn profiles. SimpleSequence drafts the outreach, sends on your pace, and keeps the replies in one place.
          </p>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step.n} className="card p-5">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-(--tint) text-xs font-semibold text-(--ochre)">
                  {step.n}
                </span>
                <h3 className="mt-4 text-lg">{step.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-(--muted)">{step.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="agents" className="border-t border-(--line)">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="card flex flex-wrap items-center justify-between gap-8 p-8 sm:p-10">
            <div className="max-w-2xl">
              <p className="eyebrow">For agents</p>
              <h2 className="mt-3 text-3xl tracking-tight sm:text-4xl">Your agent can run the loop</h2>
              <p className="mt-4 leading-relaxed text-(--muted)">
                In Settings, choose Add to Cursor. Your agent can import LinkedIn URLs, draft a sequence, start it, read the inbox, reply, and open Analytics. Connecting LinkedIn stays in Settings. Import never sends on its own.
              </p>
            </div>
            <Link href="/lists" className="btn btn-lg btn-primary">
              Open app
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-(--line) bg-(--panel)">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-(--muted)">
          <Logo />
          <Link href="/lists" className="btn btn-sm btn-quiet">
            Open app
          </Link>
        </div>
      </footer>
    </div>
  );
}

function FeatureExample({ id }: { id: FeatureId }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-(--line) bg-(--input) px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-(--line)" />
        <span className="h-2.5 w-2.5 rounded-full bg-(--line)" />
        <span className="h-2.5 w-2.5 rounded-full bg-(--line)" />
        <span className="ml-3 text-xs text-(--muted)">Preview</span>
      </div>
      <AppChrome active={id === "sequences" ? "Analytics" : "People"}>
        {id === "sequences" ? <AnalyticsExample /> : <PeopleExample />}
      </AppChrome>
    </div>
  );
}

const PREVIEW_NAV = ["People", "Sequences", "Inbox", "Analytics", "Frequency", "Settings"];

function AppChrome({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="flex min-h-80">
      <div className="hidden w-44 shrink-0 flex-col gap-1 border-r border-(--line) bg-(--panel) p-3 sm:flex">
        {PREVIEW_NAV.map((label) => (
          <span
            key={label}
            className={`rounded-lg px-2 py-1.5 text-sm ${
              label === active ? "bg-(--tint) font-medium text-(--ochre)" : "text-(--muted)"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1 bg-(--paper) p-5">{children}</div>
    </div>
  );
}

function AnalyticsExample() {
  return (
    <>
      <h3 className="text-xl">Analytics</h3>
      <p className="mt-1 text-sm text-(--muted)">Sample numbers. A live board stays at zero until a sequence sends.</p>
      <div className="stat-grid mt-4 grid-cols-2 sm:grid-cols-4">
        {[
          ["Sent", "12"],
          ["Skipped", "3"],
          ["Replies", "2"],
          ["Reply rate", "17%"],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-(--muted)">{label}</p>
            <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
          </div>
        ))}
      </div>
      <div className="card mt-4 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">Restaurant ops outreach</p>
          <StatusBadge tone="ok">Running</StatusBadge>
        </div>
        <p className="mt-1 text-(--muted)">Step 2 (message) is the strongest so far. Top skip: not connected.</p>
      </div>
      <p className="mt-3 text-xs text-(--muted)">
        Save as a new draft is available now. Writing new copy from these stats is coming soon.
      </p>
    </>
  );
}

function PeopleExample() {
  return (
    <>
      <h3 className="text-xl">People</h3>
      <p className="field mt-3 font-mono text-(--muted)">
        https://www.linkedin.com/in/priya-rao
        <br />
        https://www.linkedin.com/in/matt-cole
      </p>
      <div className="card mt-4 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-(--input) text-(--muted)">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">LinkedIn</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-(--line)">
              <td className="px-4 py-2 font-medium">Priya Rao</td>
              <td className="px-4 py-2">Head of Operations</td>
              <td className="px-4 py-2 text-(--muted)">linkedin.com/in/priya-rao</td>
            </tr>
            <tr className="border-t border-(--line)">
              <td className="px-4 py-2 font-medium">Matt Cole</td>
              <td className="px-4 py-2">VP Sales</td>
              <td className="px-4 py-2 text-(--muted)">linkedin.com/in/matt-cole</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
