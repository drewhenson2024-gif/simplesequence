"use client";

import { AppShell } from "@/components/AppShell";
import { SoonBadge } from "@/components/Toggle";

export default function SignalsPage() {
  return (
    <AppShell>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">In-market this week</h1>
        <SoonBadge />
      </div>
      <p className="mt-2 max-w-2xl text-(--muted)">
        Hiring, funding, social engagement, and tool-switch alerts will be available soon. This page
        will show who is in-market this week — not last quarter.
      </p>
      <p className="mt-6 rounded border border-(--line) bg-(--panel) px-4 py-3 text-sm text-(--muted)">
        No live signals yet.
      </p>
    </AppShell>
  );
}
