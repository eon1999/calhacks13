"use client";

import { useMutation, useQuery } from "convex/react";
import { Activity, HeartPulse, LoaderCircle, Thermometer } from "lucide-react";
import type { ReactNode } from "react";
import { SecondaryButton } from "@/components/onboarding/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { watchListSchema, type WatchSignal } from "@/lib/watch-list";

const TIER_STYLE: Record<WatchSignal["tier"], string> = {
  info: "bg-plum/10 text-plum",
  ask: "bg-violet/15 text-violet-deep",
  notify: "bg-[#ffb86b]/30 text-[#8a4b00]",
  urgent: "bg-destructive/15 text-destructive",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Area({ icon, title, range, signals }: { icon: ReactNode; title: string; range?: string; signals: WatchSignal[] }) {
  return (
    <div className="rounded-2xl border border-plum/10 bg-white/55 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-xl">
          {icon}
          {title}
        </p>
        {range && <p className="mono-label text-plum-muted">Typical {range}</p>}
      </div>
      {signals.length === 0 ? (
        <p className="mt-2 text-sm text-plum-muted">Nothing specific found.</p>
      ) : (
        <ul className="mt-2 divide-y divide-plum/10">
          {signals.map((s) => (
            <li key={s.signal} className="flex items-center justify-between gap-3 py-2 text-sm">
              <a
                href={s.sourceUrl}
                target="_blank"
                rel="noreferrer"
                title={`Source: ${hostOf(s.sourceUrl)}`}
                className="min-w-0 hover:text-violet"
              >
                <span className="font-medium">{s.signal}</span>
                <span className="mono-label ml-2 text-violet">{s.threshold}</span>
              </a>
              <span className={`mono-label shrink-0 rounded-full px-2 py-0.5 ${TIER_STYLE[s.tier]}`}>{s.tier}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Researched heart rate / temperature / movement watch list for a patient, with its live status. */
export function WatchListCard({ patientId }: { patientId: Id<"patients"> }) {
  const row = useQuery(api.watchList.get, { patientId });
  const request = useMutation(api.watchList.request);
  const rerun = <SecondaryButton type="button" onClick={() => void request({ patientId })}>Re-run research</SecondaryButton>;

  if (row === undefined) return null;

  if (row === null) {
    return (
      <div className="rounded-2xl border border-plum/10 bg-white/55 p-4">
        <p className="font-display text-xl">What the band will watch for</p>
        <p className="mt-1 text-sm text-plum-muted">
          Search trusted medical sources for heart rate, temperature and movement warning signs for this patient.
        </p>
        <SecondaryButton type="button" className="mt-4" onClick={() => void request({ patientId })}>
          Run research
        </SecondaryButton>
      </div>
    );
  }

  if (row.status === "researching") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-violet/30 bg-white/60 p-4">
        <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin text-violet" />
        <div>
          <p className="font-display text-xl">Researching what to watch for…</p>
          <p className="mt-1 text-sm text-plum-muted">
            Searching MedlinePlus, NIH, Mayo Clinic and other trusted sources. This usually takes a minute or two.
          </p>
        </div>
      </div>
    );
  }

  if (row.status === "failed") {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-white/70 p-4">
        <p className="font-display text-xl">Research didn&apos;t finish</p>
        <p className="mt-1 text-sm text-destructive">{row.error ?? "Unknown error"}</p>
        <div className="mt-4">{rerun}</div>
      </div>
    );
  }

  const parsed = watchListSchema.safeParse(row.result);
  if (!parsed.success) {
    // Usually a result saved before the format changed (or a tab running older code).
    return (
      <div className="rounded-2xl border border-plum/10 bg-white/60 p-4">
        <p className="font-display text-xl">Watch list needs a refresh</p>
        <p className="mt-1 text-sm text-plum-muted">
          It was saved in a different format. Reload the page, or re-run research to rebuild it.
        </p>
        <div className="mt-4">{rerun}</div>
      </div>
    );
  }
  const w = parsed.data;

  return (
    <div className="space-y-3">
      <div>
        <p className="mono-label text-violet">What the band will watch for</p>
        <p className="mt-2 text-sm">{w.summary}</p>
      </div>
      <Area icon={<HeartPulse className="size-5 text-[#e2477f]" />} title="Heart rate" range={w.heartRate.typicalRestingRange} signals={w.heartRate.watchFor} />
      <Area icon={<Thermometer className="size-5 text-[#e8833a]" />} title="Temperature" range={w.temperature.typicalRange} signals={w.temperature.watchFor} />
      <Area icon={<Activity className="size-5 text-violet" />} title="Movement" signals={w.movement.watchFor} />
      {w.gaps.length > 0 && (
        <details className="text-sm text-plum-muted">
          <summary className="mono-label cursor-pointer">Couldn&apos;t confirm ({w.gaps.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {w.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="mono-label text-plum-muted">
          {w.sources.length} sources · draft for the care team, not medical advice
        </p>
        {rerun}
      </div>
    </div>
  );
}
