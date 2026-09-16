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
    title: "Self-improving sequences",
    body: "Each run has a stats board. Suggestions come from those numbers. Save as a new draft — they never auto-start.",
  },
  {
    id: "people",
    title: "Import people",
    body: "Paste LinkedIn profile URLs, or send them over MCP. We look up name, title, and company from each profile. We do not search the web for who to reach.",
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
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#mcp">MCP</a>
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
          <p className="mx-auto mt-6 max-w-xl text-lg text-(--muted)">
            Import LinkedIn profile URLs, sequence, and reply in one inbox. Draft until you say go.
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
        <h2 className="max-w-2xl text-4xl sm:text-5xl">Send the list you already have</h2>
        <p className="mt-4 max-w-2xl text-(--muted)">
          Click a block to see how it looks in the app. Open app is the only way in — these previews
          stay on this page.
        </p>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {FEATURES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFeature(f.id)}
              className={`rounded-2xl border p-6 text-left ${
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
          <h2 className="text-4xl sm:text-5xl">GTM for Claude and Codex</h2>
          <p className="mt-4 max-w-2xl text-(--muted)">
            Import LinkedIn profile URLs, draft a LinkedIn sequence, then Start. Inbox is where replies land.
            Analytics is the board. Unipile is the send pipe.
          </p>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "01", t: "Links", d: "Paste LinkedIn profile URLs, or send them over MCP. We look up name, title, and company. We do not search for people." },
              { n: "02", t: "Sequence", d: "Connection, then LinkedIn messages. Conservative LinkedIn pace. Outbox shows queued, sent, skipped, failed." },
              { n: "03", t: "Reply", d: "Inbox sorts who needs you. Stop that person. A human hits Start — MCP never auto-sends." },
              { n: "04", t: "Learn", d: "Analytics shows what worked. Suggestions write a new draft only. AI copy from stats is Coming soon." },
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

      <section id="mcp" className="border-t border-(--line)">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="text-4xl sm:text-5xl">MCP for Cursor and Claude</h2>
          <p className="mt-4 max-w-2xl text-(--muted)">
            Point the agent at the hosted MCP. It can add LinkedIn URLs, draft a sequence, Start,
            read inbox, reply, and read Analytics. Connecting LinkedIn is still Settings after Open
            app. Import never auto-sends.
          </p>
          <pre className="mt-8 max-w-2xl overflow-auto rounded-2xl border border-(--line) bg-(--panel) p-4 text-sm text-(--muted)">
            {`POST https://simplesequence-three.vercel.app/mcp
Header: X-API-Key (copy the key after Open app → Settings)`}
          </pre>
        </div>
      </section>

      <footer className="border-t border-(--line)">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-(--muted)">
          <p>SimpleSequence · MCP at /mcp</p>
          <Link href="/lists" className="text-(--ochre)">
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
        <p className="text-xs uppercase tracking-[0.18em] text-(--muted)">Example · not the app</p>
      </div>
      {id === "sequences" ? <AnalyticsExample /> : null}
      {id === "people" ? <PeopleExample /> : null}
    </div>
  );
}

function AppChrome({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-(--line) bg-(--panel)">
      <div className="flex flex-wrap gap-4 border-b border-(--line) px-4 py-3 text-sm text-(--muted)">
        {["People", "Sequences", "Inbox", "Analytics", "Settings"].map((label) => (
          <span key={label} className={label === active ? "text-(--ochre)" : ""}>
            {label}
          </span>
        ))}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function AnalyticsExample() {
  return (
    <AppChrome active="Analytics">
      <h3 className="text-2xl">Analytics</h3>
      <p className="mt-1 text-sm text-(--muted)">Sample board. Live numbers stay zero until a run sends.</p>
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
        Save as new draft is live. AI draft from these stats is Coming soon. Nothing auto-starts.
      </p>
    </AppChrome>
  );
}

function PeopleExample() {
  return (
    <AppChrome active="People">
      <h3 className="text-2xl">Add links</h3>
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
