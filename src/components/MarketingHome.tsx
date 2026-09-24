"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

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

export function MarketingHome() {
  const [feature, setFeature] = useState<FeatureId>("sequences");

  return (
    <div className="min-h-screen bg-(--paper)">
      <header className="sticky top-0 z-10 border-b border-(--line) bg-(--paper)/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="#" className="flex items-center gap-2 text-sm font-medium">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-(--ochre) text-xs text-white">
              S
            </span>
            SimpleSequence
          </a>
          <nav className="hidden items-center gap-6 text-sm text-(--muted) sm:flex">
            <a href="#features" className="hover:text-(--ink)">Features</a>
            <a href="#how" className="hover:text-(--ink)">How it works</a>
            <a href="#agents" className="hover:text-(--ink)">For agents</a>
          </nav>
          <Link
            href="/lists"
            className="btn-primary rounded-full px-4 py-2 text-sm"
          >
            Open app
          </Link>
        </div>
      </header>

      <section className="dot-grid border-b border-(--line)">
        <div className="mx-auto max-w-3xl px-6 py-28 text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-(--muted)">For Claude, Codex, and Cursor</p>
          <h1 className="mt-6 text-5xl leading-[1.05] sm:text-7xl">
            LinkedIn sequences
            <br />
            for your <span className="text-(--ochre)">agents</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-(--muted)">
            Paste LinkedIn profile URLs. Your agent drafts the sequence. You press Start, and replies land in one inbox.
          </p>
          <div className="mt-10 flex justify-center">
            <Link
              href="/lists"
              className="btn-primary rounded-full px-5 py-2.5 text-sm"
            >
              Open app →
            </Link>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="max-w-2xl text-4xl sm:text-5xl">Bring the people. We handle the sequence.</h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-(--muted)">
          Two places to start. Select one to see a preview of the app.
        </p>
        <div className="mt-12 grid items-stretch gap-4 md:grid-cols-2">
          {FEATURES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFeature(f.id)}
              className={`h-full rounded-2xl border p-6 text-left ${
                feature === f.id ? "border-(--ochre) bg-(--panel)" : "border-(--line) bg-(--panel) hover:border-(--ochre)"
              }`}
            >
              <h3 className="text-xl">{f.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-(--muted)">{f.body}</p>
            </button>
          ))}
        </div>
        <div className="mt-8">
          <FeatureExample id={feature} />
        </div>
      </section>

      <section id="how" className="border-t border-(--line)">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="text-4xl sm:text-5xl">How a sequence runs</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-(--muted)">
            You bring the LinkedIn profiles. SimpleSequence drafts the outreach, sends on your pace, and keeps the replies in one place.
          </p>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "01", t: "People", d: "Paste LinkedIn profile URLs, or send them from your agent. We look up name, title, and company." },
              { n: "02", t: "Sequence", d: "A connection request, then LinkedIn messages. The pace stays conservative. The outbox shows queued, sent, skipped, and failed." },
              { n: "03", t: "Inbox", d: "See who needs a reply, and stop a person when the conversation should end. Only you press Start." },
              { n: "04", t: "Analytics", d: "See what worked. Suggestions become a new draft. Writing new copy from the stats is coming soon." },
            ].map((step) => (
              <li key={step.n} className="rounded-2xl border border-(--line) bg-(--panel) p-5">
                <p className="text-xs text-(--ochre)">{step.n}</p>
                <h3 className="mt-3 text-lg">{step.t}</h3>
                <p className="mt-2 text-sm text-(--muted)">{step.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="agents" className="border-t border-(--line)">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="text-4xl sm:text-5xl">Your agent can run the loop</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-(--muted)">
            In Settings, choose Add to Cursor. Your agent can import LinkedIn URLs, draft a sequence, start it, read the inbox, reply, and open Analytics. Connecting LinkedIn stays in Settings. Import never sends on its own.
          </p>
          <Link href="/lists" className="btn-primary mt-8 inline-flex rounded-full px-5 py-2.5 text-sm">
            Open app
          </Link>
        </div>
      </section>

      <footer className="border-t border-(--line)">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-(--muted)">
          <p>SimpleSequence</p>
          <Link href="/lists" className="btn-primary rounded-2xl px-4 py-1.5 text-sm">
            Open app
          </Link>
        </div>
      </footer>
    </div>
  );
}

function FeatureExample({ id }: { id: FeatureId }) {
  return (
    <div className="rounded-2xl border border-(--line) bg-(--paper) p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-xs uppercase tracking-[0.18em] text-(--muted)">Preview</p>
      </div>
      {id === "sequences" ? <AnalyticsExample /> : null}
      {id === "people" ? <PeopleExample /> : null}
    </div>
  );
}

function AppChrome({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-(--line) bg-(--panel)">
      <div className="flex">
        <div className="flex w-12 shrink-0 flex-col items-center gap-3 border-r border-(--line) py-3 text-[10px] text-(--muted)">
          {["People", "Sequences", "Inbox", "Analytics", "Settings"].map((label) => (
            <span key={label} className={label === active ? "text-(--ochre)" : ""}>
              {label.slice(0, 1)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 p-4">{children}</div>
      </div>
    </div>
  );
}

function AnalyticsExample() {
  return (
    <AppChrome active="Analytics">
      <h3 className="text-2xl">Analytics</h3>
      <p className="mt-1 text-sm text-(--muted)">Sample numbers. A live board stays at zero until a sequence sends.</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Sent", "12"],
          ["Skipped", "3"],
          ["Replies", "2"],
          ["Reply rate", "17%"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-(--line) bg-(--input) px-3 py-2">
            <p className="text-xs text-(--muted)">{label}</p>
            <p className="mt-1 text-lg">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-(--line) bg-(--input) px-4 py-3 text-sm">
        <p className="font-medium">Restaurant ops outreach</p>
        <p className="mt-1 text-(--muted)">Step 2 (message) is the strongest so far. Top skip: not connected.</p>
      </div>
      <p className="mt-3 text-xs text-(--muted)">
        Save as a new draft is available now. Writing new copy from these stats is coming soon.
      </p>
    </AppChrome>
  );
}

function PeopleExample() {
  return (
    <AppChrome active="People">
      <h3 className="text-2xl">People</h3>
      <p className="mt-2 rounded-xl border border-(--line) bg-(--input) px-4 py-3 font-mono text-sm text-(--muted)">
        https://www.linkedin.com/in/priya-rao
        <br />
        https://www.linkedin.com/in/matt-cole
      </p>
      <div className="mt-4 overflow-auto rounded-xl border border-(--line)">
        <table className="w-full text-left text-sm">
          <thead className="text-(--muted)">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">LinkedIn</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-(--line)">
              <td className="px-3 py-2">Priya Rao</td>
              <td className="px-3 py-2">linkedin.com/in/priya-rao</td>
            </tr>
            <tr className="border-t border-(--line)">
              <td className="px-3 py-2">Matt Cole</td>
              <td className="px-3 py-2">linkedin.com/in/matt-cole</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppChrome>
  );
}
