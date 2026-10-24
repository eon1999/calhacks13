"use client";

import Link from "next/link";

const LINKS = [
  { id: "care", href: "/care", label: "Today" },
  { id: "settings", href: "/settings", label: "My notifications" },
  { id: "hub", href: "/hub", label: "Band & hub" },
] as const;

/** Left-rail links between the care pages, in the setup wizard's "[01] You" style. */
export function CareNav({ current }: { current: (typeof LINKS)[number]["id"] }) {
  return (
    <nav aria-label="Care pages" className="print:hidden">
      <ol className="flex gap-4 overflow-x-auto md:sticky md:top-8 md:flex-col md:gap-2">
        {LINKS.map((l, i) => (
          <li key={l.id} className="flex shrink-0 items-baseline gap-3">
            <span className={`mono-label ${l.id === current ? "text-violet" : "text-plum-muted"}`}>
              [{String(i + 1).padStart(2, "0")}]
            </span>
            <Link
              href={l.href}
              aria-current={l.id === current ? "page" : undefined}
              className={`mono-label transition-colors hover:text-violet ${l.id === current ? "text-plum" : "text-plum-muted"}`}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
