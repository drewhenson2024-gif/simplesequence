import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm uppercase tracking-[0.2em] text-(--muted)">GTM sequences for agents</p>
      <h1 className="mt-4 text-5xl">SimpleSequence</h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-(--muted)">
        Import a people list, write LinkedIn and email steps, then start sending only when you say go.
      </p>
      <ol className="mt-10 space-y-4 text-(--muted)">
        <li>
          <span className="text-(--ink)">1. Settings</span> — connect LinkedIn and a mailbox. Leave sandbox on
          until you want live send.
        </li>
        <li>
          <span className="text-(--ink)">2. People</span> — paste a CSV of names. That’s the list, not the
          messages.
        </li>
        <li>
          <span className="text-(--ink)">3. Sequences</span> — write the steps (connect, LinkedIn message,
          email). Still a draft.
        </li>
        <li>
          <span className="text-(--ink)">4. Start</span> — add people from a list, then hit Start. Outbox is
          the queue; Inbox is where replies show up.
        </li>
      </ol>
      <div className="mt-10 flex gap-4">
        <Link
          href="/settings"
          className="rounded-md bg-(--ink) px-5 py-2.5 text-(--panel) hover:bg-(--ochre)"
        >
          Connect accounts
        </Link>
        <Link href="/lists" className="rounded-md border border-(--line) px-5 py-2.5">
          Import people
        </Link>
      </div>
    </main>
  );
}
