"use client";

import { useAction, useQuery } from "convex/react";
import { Download, LoaderCircle, Printer, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AppShell, NoPatient, Panel } from "@/components/app/app-shell";
import { useSelectedPatient } from "@/components/app/use-patient";
import { AdherenceByDay } from "@/components/care/care-charts";
import { formatDateTime } from "@/components/care/chart-kit";
import { Stat } from "@/components/care/day-panels";
import { modelNote } from "@/components/care/summary-card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildFhirBundle } from "@/lib/fhir";
import { DISCLAIMER } from "@/lib/reports/summaries";
import { localTimeToday } from "@/lib/schedule";
import { EvidenceAppendix, EvidenceChips, EvidenceProvider } from "./evidence";
import { ActivityByDay, PainOverTime, PainSinceDose } from "./report-charts";
import type { ClinicianData } from "./types";

const DAY = 86_400_000;
const PRESETS = [7, 14, 30];

interface Range {
  from: number;
  to: number;
  preset: number | null;
}

function presetRange(days: number): Range {
  const to = Math.ceil(Date.now() / 60_000) * 60_000;
  return { from: to - days * DAY, to, preset: days };
}

function dateInput(timeZone: string, at: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

/** Local midnight (patient time zone) at the start of "YYYY-MM-DD". */
function startOfDate(timeZone: string, date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return localTimeToday(timeZone, "00:00", Date.UTC(y, m - 1, d, 12));
}

const STATE_ROWS = [
  { key: "doing_well", label: "Doing well", color: "#0ca30c" },
  { key: "sore_but_managing", label: "Sore but managing", color: "#fab219" },
  { key: "struggling", label: "Struggling", color: "#d03b3b" },
  { key: "unsure", label: "Unsure", color: "#64698b" },
] as const;

export function ClinicianReport({ patientId }: { patientId: Id<"patients"> }) {
  const router = useRouter();
  const { patients, patient, select } = useSelectedPatient();
  const [range, setRange] = useState<Range>(() => presetRange(14));
  const data = useQuery(api.reports.clinician, { patientId, from: range.from, to: range.to });
  const current = patients?.find((p) => p._id === patientId) ?? patient;

  return (
    <AppShell
      patients={patients}
      patient={current}
      onSelectPatient={(id) => {
        select(id);
        router.push(`/clinician/${id}`);
      }}
    >
      {data === undefined ? (
        <p className="text-plum-muted">Loading report…</p>
      ) : data === null ? (
        <NoPatient loading={false} />
      ) : (
        <Report data={data} range={range} setRange={setRange} />
      )}
    </AppShell>
  );
}

function Report({ data, range, setRange }: { data: ClinicianData; range: Range; setRange: (r: Range) => void }) {
  const tz = data.patient.timeZone;
  const { stats, report } = data;
  const generate = useAction(api.ai.generateClinicianReport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sections = report?.sections?.sections as
    | { title: string; bullets: { text: string; evidenceIds: string[] }[] }[]
    | undefined;

  // Evidence numbering: patterns first, then observations, in order of first citation.
  const order = useMemo(() => {
    const ids = [
      ...stats.patterns.flatMap((p) => p.evidenceIds),
      ...(sections ?? []).flatMap((s) => s.bullets.flatMap((b) => b.evidenceIds)),
    ];
    return [...new Set(ids)];
  }, [stats.patterns, sections]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await generate({ patientId: data.patient._id, from: data.range.from, to: data.range.to });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't generate observations");
    } finally {
      setBusy(false);
    }
  };

  const exportFhir = () => {
    const bundle = buildFhirBundle({ ...data, generatedAt: Date.now() });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cadence-${data.patient.firstName.toLowerCase()}-${dateInput(tz, data.range.from)}-to-${dateInput(tz, data.range.to - 1)}.fhir.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const a = stats.adherence;
  const h = data.patient.health;
  const states = stats.checkIns.states;
  const maxState = Math.max(1, ...Object.values(states));

  return (
    <EvidenceProvider order={order}>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mono-label text-plum-muted">Clinician report · {formatDateTime(tz, data.range.from)} – {formatDateTime(tz, data.range.to)}</p>
            <h1 className="mt-2 font-display text-[clamp(2.4rem,6vw,4rem)] leading-none">{data.patient.name}</h1>
            <p className="mt-2 text-lg text-plum-muted">
              {data.patient.recovery ? `${data.patient.recovery.procedure} on ${data.patient.recovery.surgeryDate} · ${data.patient.recovery.label}` : "No surgery details"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-plum/20 bg-white px-4 text-sm font-medium hover:bg-lilac">
              <Printer aria-hidden className="size-4" /> Print / save PDF
            </button>
            <button onClick={exportFhir} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-plum/20 bg-white px-4 text-sm font-medium hover:bg-lilac">
              <Download aria-hidden className="size-4" /> Export FHIR (JSON)
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-plum/10 bg-white/70 p-4 print:hidden">
          <div role="group" aria-label="Period" className="flex gap-1">
            {PRESETS.map((days) => (
              <button
                key={days}
                onClick={() => setRange(presetRange(days))}
                aria-pressed={range.preset === days}
                className={`min-h-11 rounded-full px-4 text-sm font-medium ${range.preset === days ? "bg-plum text-white" : "bg-white text-plum hover:bg-lilac"}`}
              >
                {days} days
              </button>
            ))}
          </div>
          <label className="text-sm">
            <span className="mono-label block text-plum-muted">From</span>
            <input
              type="date"
              className="h-11 rounded-full border border-plum/15 bg-white px-3"
              value={dateInput(tz, range.from)}
              onChange={(e) => e.target.value && setRange({ from: startOfDate(tz, e.target.value), to: range.to, preset: null })}
            />
          </label>
          <label className="text-sm">
            <span className="mono-label block text-plum-muted">To</span>
            <input
              type="date"
              className="h-11 rounded-full border border-plum/15 bg-white px-3"
              value={dateInput(tz, range.to - 1)}
              onChange={(e) => {
                if (!e.target.value) return;
                const end = startOfDate(tz, e.target.value) + DAY;
                setRange({ from: range.from, to: Math.min(end, Math.ceil(Date.now() / 60_000) * 60_000), preset: null });
              }}
            />
          </label>
        </div>

        <Panel title="Patient">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="mono-label text-plum-muted">Medicines</p>
              <ul className="mt-2 space-y-1">
                {data.medications.map((m) => (
                  <li key={m.name}>
                    <span className="font-medium">{m.name}</span> <span className="text-plum-muted">{m.doseLabel} · {m.times.join(", ")}</span>
                  </li>
                ))}
                {!data.medications.length && <li className="text-plum-muted">None listed</li>}
              </ul>
            </div>
            <div>
              <p className="mono-label text-plum-muted">Conditions and allergies</p>
              <p className="mt-2">{h?.conditions.length ? h.conditions.join(", ") : "No other conditions listed"}</p>
              <p className="mt-1 text-plum-muted">
                Allergies: {h?.noKnownAllergies ? "none known" : h?.allergies.length ? h.allergies.join(", ") : "not recorded"}
              </p>
            </div>
            <div>
              <p className="mono-label text-plum-muted">Care notes</p>
              <p className="mt-2">{data.patient.careNotes ?? "None"}</p>
            </div>
          </div>
        </Panel>

        <Panel title="Adherence">
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Taken" value={a.rate === null ? "–" : `${a.rate}%`} sub={`of ${a.onTime + a.late + a.missed} closed doses`} />
            <Stat label="On time" value={String(a.onTime)} />
            <Stat label="Late" value={String(a.late)} />
            <Stat label="Missed" value={String(a.missed)} sub={a.extraOpenings ? `${a.extraOpenings} extra openings` : undefined} />
          </div>
          <AdherenceByDay days={stats.days} height={220} />
          {a.byMedication.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="mono-label text-plum-muted">
                  <tr className="border-b border-plum/10">
                    <th className="py-2 pr-3">Medicine</th>
                    <th className="py-2 pr-3 text-right">On time</th>
                    <th className="py-2 pr-3 text-right">Late</th>
                    <th className="py-2 text-right">Missed</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {a.byMedication.map((m) => (
                    <tr key={m.name} className="border-b border-plum/5">
                      <td className="py-2 pr-3 font-medium">{m.name}</td>
                      <td className="py-2 pr-3 text-right">{m.onTime}</td>
                      <td className="py-2 pr-3 text-right">{m.late}</td>
                      <td className="py-2 text-right">{m.missed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Pain over time">
            <PainOverTime data={data} />
            <p className="mt-2 text-sm text-plum-muted">
              {stats.pain.count} scores · average {stats.pain.average ?? "–"}/10
              {stats.pain.trend !== "unknown" ? ` · ${stats.pain.earlyAverage} early → ${stats.pain.recentAverage} recently` : ""}
            </p>
          </Panel>
          <Panel title="Pain by hours since last dose">
            <PainSinceDose data={data} />
          </Panel>
        </div>

        <Panel title="Movement and heart rate">
          <ActivityByDay data={data} />
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Events">
            <EventsList data={data} />
          </Panel>
          <Panel title="Patient-reported states">
            <ul className="space-y-2">
              {STATE_ROWS.map((s) => (
                <li key={s.key} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-3 text-sm">
                  <span>{s.label}</span>
                  <span className="h-3 rounded-full bg-plum/5">
                    <span className="block h-3 rounded-full" style={{ width: `${(states[s.key] / maxState) * 100}%`, background: s.color }} />
                  </span>
                  <span className="text-right tabular-nums">{states[s.key]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-plum-muted">{stats.checkIns.count} check-ins by voice.</p>
          </Panel>
        </div>

        <Panel title="Patterns found in the data">
          {stats.patterns.length ? (
            <ul className="list-disc space-y-2 pl-5">
              {stats.patterns.map((p) => (
                <li key={p.id}>
                  {p.text}
                  <EvidenceChips ids={p.evidenceIds} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-plum-muted">No patterns met the reporting thresholds.</p>
          )}
          <p className="mt-3 text-sm text-plum-muted">Computed from logged events by fixed rules, not by AI.</p>
        </Panel>

        <Panel
          title="Observations"
          action={
            <button
              onClick={run}
              disabled={busy}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-plum px-4 text-sm font-medium text-white hover:bg-plum/85 disabled:opacity-60 print:hidden"
            >
              {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Sparkles aria-hidden className="size-4" />}
              {busy ? "Writing…" : sections ? "Regenerate" : "Generate observations with Claude"}
            </button>
          }
        >
          {sections ? (
            <div className="space-y-5">
              {sections.map((s) => (
                <section key={s.title} className="print:break-inside-avoid">
                  <h3 className="font-display text-2xl">{s.title}</h3>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5">
                    {s.bullets.map((b, i) => (
                      <li key={i}>
                        {b.text}
                        <EvidenceChips ids={b.evidenceIds} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <p className="text-sm text-plum-muted">
                {report && `${formatDateTime(tz, report.createdAt)} · ${modelNote(report.model)}`}
              </p>
            </div>
          ) : (
            <p className="text-plum-muted">
              Not generated for this period yet. Claude words the numbers above; it may only cite logged events.
            </p>
          )}
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          <p className="mt-4 rounded-2xl bg-lilac px-4 py-3 text-sm font-medium">{DISCLAIMER}</p>
        </Panel>

        <Panel title="Evidence">
          <EvidenceAppendix order={order} data={data} />
        </Panel>
      </div>
    </EvidenceProvider>
  );
}

function EventsList({ data }: { data: ClinicianData }) {
  const tz = data.patient.timeZone;
  const { falls, sos, deviceOffline } = data.stats.safety;
  const items = [
    ...falls.map((f) => ({
      id: f.id,
      at: f.at,
      text: `Possible fall: ${f.resolution === "ok" ? "said they were okay" : f.resolution === "helped" ? "asked for help" : f.resolution === "unresolved" ? "no answer, care team alerted" : "pending"}`,
    })),
    ...sos.map((s) => ({ id: s.id, at: s.at, text: "SOS pressed" })),
    ...data.stats.checkIns.redFlags.map((r) => ({ id: r.id, at: r.at, text: `Warning sign: ${r.notes ?? "see check-in"}` })),
  ].sort((x, y) => x.at - y.at);
  return (
    <>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="text-sm">
              <span className="mr-2 text-plum-muted">{formatDateTime(tz, i.at)}</span>
              {i.text}
              <EvidenceChips ids={[i.id]} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-plum-muted">No falls, SOS presses or warning signs.</p>
      )}
      {deviceOffline > 0 && <p className="mt-3 text-sm text-plum-muted">Device offline {deviceOffline} time{deviceOffline === 1 ? "" : "s"}.</p>}
    </>
  );
}
