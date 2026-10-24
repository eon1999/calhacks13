"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMinute } from "@/components/care/care-today";
import { DemoIdentityBanner, DemoIdentityPicker } from "@/components/notify/demo-identity-picker";
import { OnboardingShell, SecondaryButton, StepHeading } from "@/components/onboarding/ui";
import { useDemoIdentity } from "@/components/onboarding/use-demo-identity";
import { shortDate } from "@/lib/report/recovery";
import { timeZoneOffsetMs } from "@/lib/schedule";

const STATE_TEXT = {
  doing_well: "Doing well",
  sore_but_managing: "Sore but managing",
  struggling: "Struggling",
  unsure: "Not sure",
} as const;

// Ink for the state label, so the dot is never the only cue.
const STATE_DOT = {
  doing_well: "bg-violet",
  sore_but_managing: "bg-violet/50",
  struggling: "bg-rose-500",
  unsure: "bg-plum/25",
} as const;

type Report = Extract<NonNullable<ReturnType<typeof useReport>>, { allowed: true }>;

function useReport(patientId: string, days: number) {
  const { identity } = useDemoIdentity();
  const now = useMinute();
  return useQuery(
    api.report.recovery,
    identity ? { userId: identity.id, patientId: patientId as Id<"patients">, days, now } : "skip",
  );
}

/** /clinician/[patientId]: a read-only, printable recovery report for the doctor. */
export function ClinicianReport({ patientId }: { patientId: string }) {
  const [days, setDays] = useState<7 | 14>(7);
  const report = useReport(patientId, days);

  return (
    <OnboardingShell label="Recovery report">
      <div className="print-report">
        <DemoIdentityBanner />
        {report === undefined && <p className="text-plum-muted">Loading…</p>}
        {report && !report.allowed && (
          <>
            <StepHeading kicker="Recovery report">Not available</StepHeading>
            {report.reason === "no_permission" ? (
              <p className="text-plum-muted">
                This report is for the care team&apos;s doctor or nurse. Your day-to-day view is on{" "}
                <Link href="/care" className="underline">
                  Today
                </Link>
                .
              </p>
            ) : (
              <DemoIdentityPicker />
            )}
          </>
        )}
        {report?.allowed && <ReportBody report={report} days={days} setDays={setDays} />}
      </div>
    </OnboardingShell>
  );
}

function ReportBody({ report, days, setDays }: { report: Report; days: 7 | 14; setDays: (d: 7 | 14) => void }) {
  const { patient } = report;
  const tz = patient.timeZone;
  const flags = report.checkIns.filter((c) => c.redFlag);
  const pains = report.checkIns.filter((c) => c.painScore !== null);
  const followUps = [
    ...flags.map((c) => ({ id: c.id, at: c.at, text: `Check-in: ${c.notes ?? STATE_TEXT[c.state]}` })),
    ...report.alerts.map((a) => ({ id: a.id, at: a.at, text: `${a.tier === "urgent" ? "Urgent alert" : "Heads-up"}: ${a.reason}` })),
  ].sort((a, b) => a.at - b.at);
  const stamp = (at: number) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);

  return (
    <>
      <StepHeading
        kicker={report.recovery?.label ?? "Recovery report"}
        sub={[
          patient.procedure,
          patient.surgeryDate && `surgery ${shortDate(patient.surgeryDate)}`,
          patient.dischargeDate && `home ${shortDate(patient.dischargeDate)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        <em>{patient.name}</em>
      </StepHeading>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div role="radiogroup" aria-label="Time range" className="flex gap-2">
          {([7, 14] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={days === d}
              onClick={() => setDays(d)}
              className={`glass-pill h-9 px-4 text-sm ${days === d ? "text-violet" : "text-plum-muted"}`}
            >
              Last {d} days
            </button>
          ))}
        </div>
        <SecondaryButton type="button" onClick={() => window.print()}>
          Print
        </SecondaryButton>
      </div>
      <p className="mt-2 hidden text-sm print:block">
        Last {days} days, {shortDate(report.days[0])}–{shortDate(report.days.at(-1)!)} ({tz})
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Medicine adherence" value={report.adherencePercent === null ? "—" : `${report.adherencePercent}%`} />
        <Stat
          label="Pain (first → latest)"
          value={pains.length ? `${pains[0].painScore} → ${pains.at(-1)!.painScore}` : "—"}
          unit={pains.length ? "/10" : undefined}
        />
        <Stat label="Red flags" value={String(flags.length)} alert={flags.length > 0} />
        <Stat label="Falls / SOS" value={String(report.safetyEvents.length)} alert={report.safetyEvents.length > 0} />
      </dl>

      <Section title="Follow up">
        {followUps.length === 0 ? (
          <p className="text-plum-muted">No red flags or alerts in this period.</p>
        ) : (
          <ul className="space-y-2">
            {followUps.map((f) => (
              <li key={f.id} className="rounded-2xl border border-amber-300 bg-amber-50/80 px-4 py-2 print:border-plum/30 print:bg-transparent">
                <span className="mono-label mr-2">⚑ {stamp(f.at)}</span>
                {f.text}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Pain trend (0–10, from check-ins)">
        <PainChart points={pains.map((c) => ({ at: c.at, score: c.painScore!, label: stamp(c.at) }))} days={report.days} tz={tz} />
      </Section>

      <Section title="Medicine adherence by day">
        <table className="w-full text-sm">
          <thead className="mono-label text-left text-plum-muted">
            <tr>
              <th className="py-1 font-normal">Day</th>
              <th className="py-1 font-normal">Taken</th>
              <th className="w-1/2 py-1 font-normal">
                <span className="sr-only">Share taken</span>
              </th>
              <th className="py-1 font-normal">Missed</th>
            </tr>
          </thead>
          <tbody>
            {report.adherence.map((d) => (
              <tr key={d.date} className="border-t border-plum/10">
                <td className="py-1.5 font-mono">{shortDate(d.date)}</td>
                <td className="py-1.5">{d.counted ? `${d.taken}/${d.counted}` : "—"}</td>
                <td className="py-1.5">
                  {d.counted > 0 && (
                    <div className="h-2 rounded-full bg-plum/10" aria-hidden>
                      <div className="h-2 rounded-full bg-violet" style={{ width: `${(100 * d.taken) / d.counted}%` }} />
                    </div>
                  )}
                </td>
                <td className="py-1.5 text-plum-muted">{d.missed.map((m) => `${m.name} ${m.time}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-plum-muted">
          Counts each current medicine from the day they got home. Doses still due or later today aren&apos;t counted yet.
        </p>
      </Section>

      <Section title="Check-ins">
        {report.checkIns.length === 0 ? (
          <p className="text-plum-muted">No check-ins in this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="mono-label text-left text-plum-muted">
              <tr>
                <th className="py-1 font-normal">When</th>
                <th className="py-1 font-normal">How they said they were</th>
                <th className="py-1 font-normal">Pain</th>
                <th className="py-1 font-normal">Notes</th>
              </tr>
            </thead>
            <tbody>
              {report.checkIns.map((c) => (
                <tr key={c.id} className={`border-t border-plum/10 ${c.redFlag ? "bg-amber-50/70" : ""}`}>
                  <td className="py-1.5 font-mono whitespace-nowrap">{stamp(c.at)}</td>
                  <td className="py-1.5">
                    <span className={`mr-2 inline-block size-2 rounded-full ${STATE_DOT[c.state]}`} aria-hidden />
                    {STATE_TEXT[c.state]}
                  </td>
                  <td className="py-1.5">{c.painScore ?? "—"}</td>
                  <td className="py-1.5">
                    {c.redFlag && <span className="mono-label mr-1 text-rose-700">⚑ red flag</span>}
                    {c.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Falls and SOS">
        {report.safetyEvents.length === 0 ? (
          <p className="text-plum-muted">None in this period.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {report.safetyEvents.map((e) => (
              <li key={e.id}>
                <span className="font-mono">{stamp(e.at)}</span> · {e.type === "fall" ? "Possible fall" : "SOS pressed"}
                {e.resolution && ` · ${e.resolution}`}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Current plan">
        <ul className="space-y-1 text-sm">
          {report.medications.map((m) => (
            <li key={m.name}>
              <span className="font-medium">{m.name}</span> {m.doseLabel} · {m.times.join(", ")}
            </li>
          ))}
        </ul>
        {patient.careNotes && <p className="mt-3 text-sm">Care notes: {patient.careNotes}</p>}
        {(patient.conditions.length > 0 || patient.allergies.length > 0) && (
          <p className="mt-1 text-sm text-plum-muted">
            {patient.conditions.length > 0 && `Other conditions: ${patient.conditions.join(", ")}. `}
            {patient.allergies.length > 0 && `Allergies: ${patient.allergies.join(", ")}.`}
          </p>
        )}
      </Section>
      <p className="mt-10 text-xs text-plum-muted">
        From Cadence wristband check-ins and dose confirmations. Patient-reported; not a clinical record.
      </p>
    </>
  );
}

function Stat({ label, value, unit, alert }: { label: string; value: string; unit?: string; alert?: boolean }) {
  return (
    <div className="rounded-2xl border border-plum/10 bg-white/50 px-4 py-3 print:bg-transparent">
      <dt className="mono-label text-plum-muted">{label}</dt>
      <dd className="mt-1 font-display text-4xl">
        {alert && <span aria-label="needs attention">⚑ </span>}
        {value}
        {unit && <span className="text-base text-plum-muted">{unit}</span>}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 break-inside-avoid space-y-3">
      <h2 className="mono-label border-b border-plum/10 pb-2 text-plum-muted">{title}</h2>
      {children}
    </section>
  );
}

const W = 640;
const H = 180;
const PAD = { l: 28, r: 12, t: 10, b: 24 };

/** A single-series line: pain score per check-in across the date range. No chart library. */
function PainChart({ points, days, tz }: { points: { at: number; score: number; label: string }[]; days: string[]; tz: string }) {
  if (points.length === 0) return <p className="text-plum-muted">No pain scores reported in this period.</p>;
  // x spans the whole range so gaps between days stay visible.
  const start = Date.parse(`${days[0]}T00:00:00Z`);
  const end = Date.parse(`${days.at(-1)}T00:00:00Z`) + 86_400_000;
  // Wall-clock time in the patient's zone, on the same naive-UTC scale as `start`.
  const local = (at: number) => at + timeZoneOffsetMs(tz, at);
  const x = (at: number) => PAD.l + ((local(at) - start) / (end - start)) * (W - PAD.l - PAD.r);
  const y = (score: number) => PAD.t + (1 - score / 10) * (H - PAD.t - PAD.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const dayWidth = (W - PAD.l - PAD.r) / days.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pain score over time" className="w-full text-plum">
      {[0, 5, 10].map((s) => (
        <g key={s}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(s)} y2={y(s)} stroke="currentColor" strokeOpacity={0.1} />
          <text x={PAD.l - 6} y={y(s) + 4} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.6}>
            {s}
          </text>
        </g>
      ))}
      {days.map((d, i) =>
        days.length <= 7 || i % 2 === 0 ? (
          <text key={d} x={PAD.l + dayWidth * (i + 0.5)} y={H - 6} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.6}>
            {shortDate(d)}
          </text>
        ) : null,
      )}
      <path d={path} fill="none" stroke="var(--color-violet, #7114ff)" strokeWidth={2} strokeLinejoin="round" />
      {points.map((p) => (
        <g key={p.at}>
          <circle cx={x(p.at)} cy={y(p.score)} r={4} fill="var(--color-violet, #7114ff)" stroke="white" strokeWidth={2} />
          {/* Bigger invisible hit target for the hover tooltip. */}
          <circle cx={x(p.at)} cy={y(p.score)} r={12} fill="transparent">
            <title>
              {p.label}: pain {p.score}/10
            </title>
          </circle>
        </g>
      ))}
      {points.length > 0 && (
        <text x={x(points.at(-1)!.at) + 8} y={y(points.at(-1)!.score) - 8} fontSize={11} fill="currentColor">
          {points.at(-1)!.score}
        </text>
      )}
    </svg>
  );
}
