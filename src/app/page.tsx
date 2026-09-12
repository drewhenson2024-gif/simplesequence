import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm uppercase tracking-[0.2em] text-(--muted)">GTM sequences for agents</p>
      <h1 className="mt-4 text-5xl">SimpleSequence</h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-(--muted)">
        Import a Codex people list. Save a mixed LinkedIn + email draft. Start sending only when a
        human says go. Unipile is the pipe. Nothing leaves the box until then.
      </p>
      <div className="mt-10 flex gap-4">
        <Link
          href="/lists"
          className="rounded-md bg-(--ink) px-5 py-2.5 text-(--panel) hover:bg-(--ochre)"
        >
          Open app
        </Link>
        <Link href="/campaigns" className="rounded-md border border-(--line) px-5 py-2.5">
          Campaigns
        </Link>
      </div>
    </main>
  );
}
