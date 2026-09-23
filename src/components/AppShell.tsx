"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UndoBar } from "@/components/UndoBar";
import { ensurePeopleCache } from "@/lib/client/peopleCache";
import { ensureSequencesCache } from "@/lib/client/sequencesCache";
import { ensureAnalyticsCache, ensureInboxCache, ensureSettingsCache, useSettings } from "@/lib/client/tabCaches";

const NAV = [
  { href: "/lists", label: "People", icon: PeopleIcon },
  { href: "/campaigns", label: "Sequences", icon: SequencesIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/analytics", label: "Analytics", icon: AnalyticsIcon },
  { href: "/frequency", label: "Frequency", icon: FrequencyIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-sm text-(--muted) hover:text-(--ink)">
      ← {label}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data } = useSettings();
  const trialOn = Boolean(data?.settings?.developerTrial ?? data?.settings?.workspace?.developerTrial);
  const items = [
    ...NAV.slice(0, 4),
    ...(trialOn ? [{ href: "/trials", label: "Trial", icon: TrialIcon }] : []),
    NAV[4]!,
    NAV[5]!,
  ];
  useEffect(() => {
    void ensurePeopleCache();
    void ensureSequencesCache();
    void ensureInboxCache();
    void ensureAnalyticsCache();
    void ensureSettingsCache();
  }, []);
  return (
    <div className="app flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-14 shrink-0 flex-col items-center border-r border-(--line) bg-(--paper) py-3">
        <Link
          href="/"
          title="SimpleSequence"
          className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-(--ochre) text-xs font-medium text-white"
        >
          S
        </Link>
        <nav className="flex flex-1 flex-col items-center gap-1">
          {items.map((item) => {
            const active = path === item.href || path.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  active ? "bg-(--input) text-(--ochre)" : "text-(--muted) hover:bg-(--input) hover:text-(--ink)"
                }`}
              >
                <Icon />
                <span className="sr-only">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <main className="px-8 py-6">
          <UndoBar />
          {children}
        </main>
      </div>
    </div>
  );
}

function PeopleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a3 3 0 0 1 0 5.74" />
    </svg>
  );
}

function SequencesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M3 3v18h18" />
      <path d="M7 16v-5" />
      <path d="M12 16V8" />
      <path d="M17 16v-3" />
    </svg>
  );
}

function FrequencyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12l3-2" />
      <path d="M12 8v4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function TrialIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M10 2v7.31a3 3 0 0 1-.88 2.12L4 16.55A2 2 0 0 0 5.41 20h13.18A2 2 0 0 0 20 16.55l-5.12-5.12A3 3 0 0 1 14 9.31V2" />
      <path d="M8 2h8" />
    </svg>
  );
}
