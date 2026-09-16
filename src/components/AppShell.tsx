"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UndoBar } from "@/components/UndoBar";
import { ensurePeopleCache } from "@/lib/client/peopleCache";
import { ensureSequencesCache } from "@/lib/client/sequencesCache";
import { ensureAnalyticsCache, ensureInboxCache, ensureSettingsCache } from "@/lib/client/tabCaches";

const NAV = [
  { href: "/lists", label: "People" },
  { href: "/campaigns", label: "Sequences" },
  { href: "/inbox", label: "Inbox" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
];

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-sm text-(--muted) hover:text-(--ink)">
      ← {label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  useEffect(() => {
    void ensurePeopleCache();
    void ensureSequencesCache();
    void ensureInboxCache();
    void ensureAnalyticsCache();
    void ensureSettingsCache();
  }, []);
  return (
    <div className="min-h-screen">
      <header className="border-b border-(--line) bg-(--paper)">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-(--ochre) text-xs text-white">
              S
            </span>
            SimpleSequence
          </Link>
          <nav className="flex flex-wrap gap-5 text-sm">
            {NAV.map((item) => {
              const active = path === item.href || path.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "text-(--ochre)" : "text-(--muted) hover:text-(--ink)"}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <UndoBar />
        {children}
      </main>
    </div>
  );
}
