"use client";

import { TriangleAlert, CircleCheck, Circle, Clock, Footprints, HeartPulse, MessageCircle, Pill, ShieldAlert, WifiOff } from "lucide-react";
import { Panel } from "@/components/app/app-shell";
import { formatTime } from "./chart-kit";
import type { CareDose, CareTimelineEntry } from "./types";

const DOSE_STATUS: Record<string, { label: string; cls: string }> = {
  upcoming: { label: "Upcoming", cls: "bg-plum/5 text-plum-muted border-plum/15" },
  due: { label: "Due now", cls: "bg-blue-50 text-blue-900 border-blue-300" },
  opened: { label: "Opened, not confirmed", cls: "bg-violet/10 text-plum border-violet/30" },
  taken: { label: "Taken", cls: "bg-green-50 text-green-900 border-green-300" },
  late: { label: "Taken late", cls: "bg-amber-50 text-amber-900 border-amber-300" },
  missed: { label: "Missed", cls: "bg-red-50 text-red-900 border-red-300" },
  extra_opening: { label: "Extra opening", cls: "bg-amber-50 text-amber-900 border-amber-300" },
  not_scheduled: { label: "Added after this time", cls: "bg-plum/5 text-plum-muted border-plum/15" },
};

export function DosesToday({ doses, timeZone }: { doses: CareDose[]; timeZone: string }) {
  // One row per dose time; medicines in the same compartment share it.
  const groups = new Map<number, CareDose[]>();
  for (const d of doses) groups.set(d.scheduledFor, [...(groups.get(d.scheduledFor) ?? []), d]);
  return (
    <Panel title="Today's medicines">
      {doses.length === 0 ? (
        <p className="text-plum-muted">No medicines scheduled today.</p>
      ) : (
        <ul className="divide-y divide-plum/10">
          {[...groups.entries()].map(([time, group]) => (
            <li key={time} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
              <span className="w-20 shrink-0 font-display text-2xl leading-none">{formatTime(timeZone, time)}</span>
              <ul className="min-w-0 flex-1 space-y-2">
                {group.map((d) => {
                  const s = DOSE_STATUS[d.status] ?? DOSE_STATUS.upcoming;
                  return (
                    <li key={d.key} className="flex flex-wrap items-center gap-2">
                      <Pill aria-hidden className="size-4 text-plum-muted" />
                      <span className="font-medium">{d.name}</span>
                      <span className="text-sm text-plum-muted">{d.doseLabel}</span>
                      <span className={`ml-auto rounded-full border px-3 py-0.5 text-sm font-medium ${s.cls}`}>
                        {s.label}
                        {d.at && ["taken", "late", "opened"].includes(d.status) ? ` · ${formatTime(timeZone, d.at)}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const TONE: Record<CareTimelineEntry["tone"], string> = {
  good: "text-green-700 bg-green-50 border-green-200",
  neutral: "text-plum bg-plum/5 border-plum/15",
  warn: "text-amber-800 bg-amber-50 border-amber-200",
  bad: "text-red-700 bg-red-50 border-red-200",
};

function TimelineIcon({ kind, tone }: { kind: CareTimelineEntry["kind"]; tone: CareTimelineEntry["tone"] }) {
  const cls = "size-4";
  const icon =
    kind === "dose" ? (
      tone === "good" ? <CircleCheck className={cls} /> : tone === "bad" ? <Circle className={cls} /> : <Pill className={cls} />
    ) : kind === "check_in" ? (
      <MessageCircle className={cls} />
    ) : kind === "fall" ? (
      <TriangleAlert className={cls} />
    ) : kind === "sos" ? (
      <ShieldAlert className={cls} />
    ) : kind === "device_offline" ? (
      <WifiOff className={cls} />
    ) : (
      <Clock className={cls} />
    );
  return (
    <span aria-hidden className={`flex size-8 shrink-0 items-center justify-center rounded-full border ${TONE[tone]}`}>
      {icon}
    </span>
  );
}

export function Timeline({ entries, timeZone }: { entries: CareTimelineEntry[]; timeZone: string }) {
  return (
    <Panel title="Today, as it happened">
      {entries.length === 0 ? (
        <p className="text-plum-muted">Nothing logged yet today.</p>
      ) : (
        <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-plum/10">
          {[...entries].reverse().map((e) => (
            <li key={e.id} className="relative flex gap-3">
              <TimelineIcon kind={e.kind} tone={e.tone} />
              <div className="min-w-0">
                <p className="text-base font-medium leading-snug">
                  <span className="mr-2 text-plum-muted tabular-nums">{formatTime(timeZone, e.at)}</span>
                  {e.title}
                </p>
                {e.detail && <p className="mt-0.5 text-sm text-plum-muted">{e.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function Stat({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: "steps" | "heart" }) {
  return (
    <div className="rounded-2xl border border-plum/10 bg-white px-4 py-3">
      <p className="mono-label flex items-center gap-1.5 text-plum-muted">
        {icon === "steps" && <Footprints aria-hidden className="size-3.5" />}
        {icon === "heart" && <HeartPulse aria-hidden className="size-3.5" />}
        {label}
      </p>
      <p className="mt-1 font-display text-4xl leading-none">{value}</p>
      {sub && <p className="mt-1 text-sm text-plum-muted">{sub}</p>}
    </div>
  );
}
