"use client";

import type { ReactNode } from "react";

// Shared chart vocabulary for the care and clinician pages (Recharts).
// Colors follow the dataviz reference palette: fixed categorical order, a
// reserved status set, recessive grid and axes, text in ink tokens.

export const SERIES = {
  blue: "#2a78d6",
  aqua: "#1baf7a",
  yellow: "#eda100",
} as const;

export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

export const INK = {
  primary: "#2a1647",
  secondary: "#64698b",
  grid: "#e7e2f0",
} as const;

export const AXIS_TICK = { fill: INK.secondary, fontSize: 12 };

/** Fixed-height frame so ResponsiveContainer has a measurable box (and prints). */
export function ChartFrame({ height = 220, label, children }: { height?: number; label: string; children: ReactNode }) {
  return (
    <figure aria-label={label} className="w-full print:break-inside-avoid" style={{ height }}>
      {children}
    </figure>
  );
}

export function LegendRow({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-plum-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-3 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export const tooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid #e7e2f0",
    color: INK.primary,
    fontSize: 13,
    boxShadow: "0 8px 24px -12px rgb(66 18 140 / 0.35)",
  },
  labelStyle: { color: INK.primary, fontWeight: 600 },
  itemStyle: { color: INK.primary },
};

export function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <p className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-plum/15 text-sm text-plum-muted">
      {children}
    </p>
  );
}

export function formatTime(timeZone: string, at: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(at));
}

export function formatDateTime(timeZone: string, at: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
}

/** "Oct 24" from "2026-10-24". */
export function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
