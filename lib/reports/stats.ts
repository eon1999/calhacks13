// Numbers and patterns for the care summary and the clinician report.
// Computed here, in code; Claude only puts them into words. Every pattern
// carries the ids of the rows it came from so the report can cite them.

import { formatLocalTime } from "../schedule";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface ReportDose {
  id: string;
  medicationId: string;
  medicationName: string;
  scheduledFor: number;
  windowMinutes: number;
  status: "due" | "opened" | "taken" | "late" | "missed" | "extra_opening";
  openedAt?: number;
  confirmedAt?: number;
}

export interface ReportCheckIn {
  id: string;
  at: number;
  state: "doing_well" | "sore_but_managing" | "struggling" | "unsure";
  painScore?: number;
  notes?: string;
  redFlag: boolean;
  trigger: string;
}

export interface ReportEvent {
  id: string;
  type: "fall" | "sos" | "lid_open" | "device_offline";
  at: number;
  resolution?: "ok" | "helped" | "unresolved";
}

export interface ReportActivity {
  windowStart: number;
  steps: number;
  activeMinutes: number;
  heartRate?: number;
}

export interface ReportInput {
  timeZone: string;
  from: number;
  to: number;
  doses: ReportDose[];
  checkIns: ReportCheckIn[];
  events: ReportEvent[];
  activity: ReportActivity[];
}

export type DoseOutcome = "on_time" | "late" | "missed" | "pending" | "extra";

export function doseOutcome(d: ReportDose): DoseOutcome {
  if (d.status === "extra_opening") return "extra";
  if (d.status === "missed") return "missed";
  if (d.status === "due") return "pending";
  const at = d.openedAt ?? d.confirmedAt;
  if (d.status === "late" || (at !== undefined && at > d.scheduledFor + d.windowMinutes * MINUTE)) return "late";
  return "on_time";
}

/** "2026-10-24" in the patient's time zone. */
export function localDate(timeZone: string, at: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(at),
  );
}

function avg(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function round1(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}

export interface Pattern {
  id: string;
  text: string;
  evidenceIds: string[];
}

export interface DayRow {
  date: string;
  onTime: number;
  late: number;
  missed: number;
  pending: number;
  steps: number;
  activeMinutes: number;
  avgHeartRate: number | null;
  avgPain: number | null;
}

export interface ReportStats {
  period: { from: number; to: number; days: number };
  adherence: {
    scheduled: number;
    onTime: number;
    late: number;
    missed: number;
    pending: number;
    openedNotConfirmed: number;
    extraOpenings: number;
    /** On time or late, over doses whose window has closed. null when none have. */
    rate: number | null;
    byMedication: { name: string; onTime: number; late: number; missed: number }[];
    missedIds: string[];
    lateIds: string[];
    extraIds: string[];
  };
  pain: {
    count: number;
    average: number | null;
    earlyAverage: number | null;
    recentAverage: number | null;
    trend: "improving" | "worsening" | "steady" | "unknown";
    points: { id: string; at: number; score: number; hoursSinceDose: number | null }[];
    bySinceDose: { bucket: string; average: number | null; n: number; ids: string[] }[];
  };
  checkIns: {
    count: number;
    states: Record<ReportCheckIn["state"], number>;
    redFlags: { id: string; at: number; notes?: string }[];
  };
  safety: {
    falls: { id: string; at: number; resolution?: string }[];
    sos: { id: string; at: number }[];
    deviceOffline: number;
  };
  activity: {
    stepsPerDay: number | null;
    earlyStepsPerDay: number | null;
    recentStepsPerDay: number | null;
    avgHeartRate: number | null;
  };
  days: DayRow[];
  patterns: Pattern[];
}

const SINCE_DOSE_BUCKETS = [
  { label: "0–2 h", min: 0, max: 2 },
  { label: "2–4 h", min: 2, max: 4 },
  { label: "4–6 h", min: 4, max: 6 },
  { label: "6 h+", min: 6, max: Infinity },
];

function takenTimes(doses: ReportDose[]): number[] {
  return doses
    .filter((d) => ["on_time", "late"].includes(doseOutcome(d)))
    .map((d) => d.confirmedAt ?? d.openedAt ?? d.scheduledFor)
    .sort((a, b) => a - b);
}

function hoursSinceLastDose(taken: number[], at: number): number | null {
  let last: number | null = null;
  for (const t of taken) {
    if (t <= at) last = t;
    else break;
  }
  return last === null ? null : (at - last) / HOUR;
}

/** Days in the period, oldest first, as local dates. */
function periodDates(timeZone: string, from: number, to: number): string[] {
  const dates: string[] = [];
  for (let t = from; t < to; t += 6 * HOUR) {
    const d = localDate(timeZone, t);
    if (dates.at(-1) !== d) dates.push(d);
  }
  const last = localDate(timeZone, to - 1);
  if (dates.at(-1) !== last) dates.push(last);
  return dates;
}

export function computeStats(input: ReportInput): ReportStats {
  const { timeZone, from, to } = input;
  const doses = input.doses.filter((d) => d.scheduledFor >= from && d.scheduledFor < to);
  const checkIns = input.checkIns.filter((c) => c.at >= from && c.at < to).sort((a, b) => a.at - b.at);
  const events = input.events.filter((e) => e.at >= from && e.at < to);
  const activity = input.activity.filter((a) => a.windowStart >= from && a.windowStart < to);

  // Adherence
  const outcomes = doses.map((d) => ({ d, o: doseOutcome(d) }));
  const count = (o: DoseOutcome) => outcomes.filter((x) => x.o === o).length;
  const scheduledDoses = outcomes.filter((x) => x.o !== "extra");
  const onTime = count("on_time");
  const late = count("late");
  const missed = count("missed");
  const closed = onTime + late + missed;
  const meds = [...new Set(scheduledDoses.map((x) => x.d.medicationName))].sort();

  // Days
  const dates = periodDates(timeZone, from, to);
  const days: DayRow[] = dates.map((date) => {
    const dayDoses = scheduledDoses.filter((x) => localDate(timeZone, x.d.scheduledFor) === date);
    const dayActivity = activity.filter((a) => localDate(timeZone, a.windowStart) === date);
    const hr = dayActivity.map((a) => a.heartRate).filter((h): h is number => h !== undefined);
    const pains = checkIns
      .filter((c) => c.painScore !== undefined && localDate(timeZone, c.at) === date)
      .map((c) => c.painScore!);
    return {
      date,
      onTime: dayDoses.filter((x) => x.o === "on_time").length,
      late: dayDoses.filter((x) => x.o === "late").length,
      missed: dayDoses.filter((x) => x.o === "missed").length,
      pending: dayDoses.filter((x) => x.o === "pending").length,
      steps: dayActivity.reduce((s, a) => s + a.steps, 0),
      activeMinutes: dayActivity.reduce((s, a) => s + a.activeMinutes, 0),
      avgHeartRate: round1(avg(hr)),
      avgPain: round1(avg(pains)),
    };
  });

  // Pain
  const taken = takenTimes(input.doses);
  const points = checkIns
    .filter((c) => c.painScore !== undefined)
    .map((c) => ({
      id: c.id,
      at: c.at,
      score: c.painScore!,
      hoursSinceDose: round1(hoursSinceLastDose(taken, c.at)),
    }));
  const third = Math.max(1, Math.min(3, Math.floor(days.length / 3)));
  const painDays = days.filter((d) => d.avgPain !== null);
  const earlyAverage = painDays.length >= 2 ? round1(avg(painDays.slice(0, third).map((d) => d.avgPain!))) : null;
  const recentAverage = painDays.length >= 2 ? round1(avg(painDays.slice(-third).map((d) => d.avgPain!))) : null;
  let trend: ReportStats["pain"]["trend"] = "unknown";
  if (earlyAverage !== null && recentAverage !== null && painDays.length >= 4) {
    const delta = recentAverage - earlyAverage;
    trend = delta <= -1.5 ? "improving" : delta >= 1.5 ? "worsening" : "steady";
  }
  const bySinceDose = SINCE_DOSE_BUCKETS.map((b) => {
    const inBucket = points.filter((p) => p.hoursSinceDose !== null && p.hoursSinceDose >= b.min && p.hoursSinceDose < b.max);
    return { bucket: b.label, average: round1(avg(inBucket.map((p) => p.score))), n: inBucket.length, ids: inBucket.map((p) => p.id) };
  });

  // Check-ins
  const states: Record<ReportCheckIn["state"], number> = { doing_well: 0, sore_but_managing: 0, struggling: 0, unsure: 0 };
  for (const c of checkIns) states[c.state]++;

  // Activity
  const stepDays = days.filter((d) => d.steps > 0);
  const hrs = activity.map((a) => a.heartRate).filter((h): h is number => h !== undefined);

  const stats: ReportStats = {
    period: { from, to, days: dates.length },
    adherence: {
      scheduled: scheduledDoses.length,
      onTime,
      late,
      missed,
      pending: count("pending"),
      openedNotConfirmed: doses.filter((d) => d.status === "opened").length,
      extraOpenings: count("extra"),
      rate: closed ? Math.round(((onTime + late) / closed) * 1000) / 10 : null,
      byMedication: meds.map((name) => {
        const mine = scheduledDoses.filter((x) => x.d.medicationName === name);
        return {
          name,
          onTime: mine.filter((x) => x.o === "on_time").length,
          late: mine.filter((x) => x.o === "late").length,
          missed: mine.filter((x) => x.o === "missed").length,
        };
      }),
      missedIds: outcomes.filter((x) => x.o === "missed").map((x) => x.d.id),
      lateIds: outcomes.filter((x) => x.o === "late").map((x) => x.d.id),
      extraIds: outcomes.filter((x) => x.o === "extra").map((x) => x.d.id),
    },
    pain: {
      count: points.length,
      average: round1(avg(points.map((p) => p.score))),
      earlyAverage,
      recentAverage,
      trend,
      points,
      bySinceDose,
    },
    checkIns: {
      count: checkIns.length,
      states,
      redFlags: checkIns.filter((c) => c.redFlag).map((c) => ({ id: c.id, at: c.at, notes: c.notes })),
    },
    safety: {
      falls: events.filter((e) => e.type === "fall").map((e) => ({ id: e.id, at: e.at, resolution: e.resolution })),
      sos: events.filter((e) => e.type === "sos").map((e) => ({ id: e.id, at: e.at })),
      deviceOffline: events.filter((e) => e.type === "device_offline").length,
    },
    activity: {
      stepsPerDay: stepDays.length ? Math.round(avg(stepDays.map((d) => d.steps))!) : null,
      earlyStepsPerDay: stepDays.length >= 4 ? Math.round(avg(stepDays.slice(0, third).map((d) => d.steps))!) : null,
      recentStepsPerDay: stepDays.length >= 4 ? Math.round(avg(stepDays.slice(-third).map((d) => d.steps))!) : null,
      avgHeartRate: round1(avg(hrs)),
    },
    days,
    patterns: [],
  };
  stats.patterns = findPatterns(stats, outcomes.map((x) => ({ ...x.d, outcome: x.o })), timeZone);
  return stats;
}

const MAX_EVIDENCE = 8;

/** Patterns worth discussing. Thresholds are deliberately conservative. */
export function findPatterns(
  stats: ReportStats,
  doses: (ReportDose & { outcome: DoseOutcome })[],
  timeZone: string,
): Pattern[] {
  const patterns: Pattern[] = [];

  // Pain later after a dose (wearing off before the next one).
  const soon = stats.pain.bySinceDose[0];
  const laterPoints = stats.pain.points.filter((p) => p.hoursSinceDose !== null && p.hoursSinceDose >= 4);
  const laterAvg = avg(laterPoints.map((p) => p.score));
  if (soon.n >= 3 && laterPoints.length >= 3 && soon.average !== null && laterAvg !== null && laterAvg - soon.average >= 1.5) {
    patterns.push({
      id: "pain_after_dose",
      text: `Pain scores were higher 4 or more hours after a dose (average ${round1(laterAvg)}/10, ${laterPoints.length} check-ins) than within 2 hours of one (average ${soon.average}/10, ${soon.n} check-ins).`,
      evidenceIds: [...laterPoints.map((p) => p.id).slice(0, MAX_EVIDENCE / 2), ...soon.ids.slice(0, MAX_EVIDENCE / 2)],
    });
  }

  // Misses clustered at one time of day.
  const missedDoses = doses.filter((d) => d.outcome === "missed");
  if (missedDoses.length >= 2) {
    const byTime = new Map<string, typeof missedDoses>();
    for (const d of missedDoses) {
      const t = formatLocalTime(timeZone, d.scheduledFor);
      byTime.set(t, [...(byTime.get(t) ?? []), d]);
    }
    const [time, group] = [...byTime.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    if (group.length >= 2 && group.length / missedDoses.length >= 0.5) {
      patterns.push({
        id: "missed_time_of_day",
        text: `Most missed doses were at ${time} (${group.length} of ${missedDoses.length}).`,
        evidenceIds: group.map((d) => d.id).slice(0, MAX_EVIDENCE),
      });
    }
  }

  // Pain trend across the period.
  const { trend, earlyAverage, recentAverage } = stats.pain;
  if (trend === "improving" || trend === "worsening") {
    const pts = stats.pain.points;
    patterns.push({
      id: "pain_trend",
      text: `Reported pain went from an average of ${earlyAverage}/10 at the start of the period to ${recentAverage}/10 most recently.`,
      evidenceIds: [...pts.slice(0, 3), ...pts.slice(-3)].map((p) => p.id),
    });
  }

  // Late doses.
  if (stats.adherence.late >= 2) {
    patterns.push({
      id: "late_doses",
      text: `${stats.adherence.late} doses were taken late (after their reminder window).`,
      evidenceIds: stats.adherence.lateIds.slice(0, MAX_EVIDENCE),
    });
  }

  // Extra openings.
  if (stats.adherence.extraOpenings >= 1) {
    patterns.push({
      id: "extra_openings",
      text: `The pillbox was opened again after a dose had already been taken ${stats.adherence.extraOpenings} time${stats.adherence.extraOpenings === 1 ? "" : "s"}.`,
      evidenceIds: stats.adherence.extraIds.slice(0, MAX_EVIDENCE),
    });
  }

  // Falls.
  if (stats.safety.falls.length) {
    const unanswered = stats.safety.falls.filter((f) => f.resolution !== "ok").length;
    patterns.push({
      id: "falls",
      text: `${stats.safety.falls.length} possible fall${stats.safety.falls.length === 1 ? " was" : "s were"} detected${unanswered ? `; ${unanswered} needed the care team` : "; each time they said they were okay"}.`,
      evidenceIds: stats.safety.falls.map((f) => f.id).slice(0, MAX_EVIDENCE),
    });
  }

  // Warning signs reported in check-ins.
  if (stats.checkIns.redFlags.length) {
    patterns.push({
      id: "red_flags",
      text: `${stats.checkIns.redFlags.length} check-in${stats.checkIns.redFlags.length === 1 ? "" : "s"} included a warning sign the care team was told about.`,
      evidenceIds: stats.checkIns.redFlags.map((r) => r.id).slice(0, MAX_EVIDENCE),
    });
  }

  return patterns;
}

/** Every evidence id the stats mention; Claude may cite only these. */
export function evidenceIds(stats: ReportStats): string[] {
  return [
    ...new Set([
      ...stats.patterns.flatMap((p) => p.evidenceIds),
      ...stats.adherence.missedIds,
      ...stats.adherence.lateIds,
      ...stats.adherence.extraIds,
      ...stats.pain.points.map((p) => p.id),
      ...stats.checkIns.redFlags.map((r) => r.id),
      ...stats.safety.falls.map((f) => f.id),
      ...stats.safety.sos.map((s) => s.id),
    ]),
  ];
}
