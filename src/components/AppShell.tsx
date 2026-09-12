import Link from "next/link";

const NAV = [
  { href: "/lists", label: "Lists" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/inbox", label: "Inbox" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-(--line) bg-(--panel)">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="text-xl font-semibold">
            SimpleSequence
          </Link>
          <nav className="flex flex-wrap gap-5 text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-(--muted) hover:text-(--ink)">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
