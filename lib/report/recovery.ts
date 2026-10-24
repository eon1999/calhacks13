// Numbers for the clinician recovery report (/clinician/[patientId]). Pure,
// so the Convex query (convex/report.ts) stays thin and the math is tested.

import {
  buildDaySchedule,
  localDayBounds,
  timeZoneOffsetMs,
  type ScheduleDoseEvent,
  type ScheduleMedication,
} from "../schedule";
import { localDateKey } from "../onboarding/recovery";

const DAY_MS = 86_400_000;

/** UTC ms of local midnight on a "YYYY-MM-DD" date in `timeZone`. */
export function localMidnight(timeZone: string, dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d);
  return naive - timeZoneOffsetMs(timeZone, naive);
}

export interface ReportDay {
  date: string; // "YYYY-MM-DD", patient's time zone
  start: number;
  end: number;
}

/** The last `days` local days, oldest first, ending with today. */
export function reportDays(timeZone: string, now: number, days: number): ReportDay[] {
  const today = localDayBounds(timeZone, now).start;
  const out: ReportDay[] = [];
  for (let k = days - 1; k >= 0; k--) {
    // Midday of each day, so a DST shift never lands us on the wrong date.
    const anchor = today - k * DAY_MS + DAY_MS / 2;
    const { start, end } = localDayBounds(timeZone, anchor);
    out.push({ date: localDateKey(timeZone, anchor), start, end });
  }
  return out;
}

export interface DayAdherence {
  date: string;
  taken: number;
  /** Doses whose window has closed (taken or missed). Doses still due or upcoming don't count yet. */
  counted: number;
  missed: { name: string; time: string }[];
}

/**
 * Medicine adherence per day. Each current medicine counts from `countFrom`
 * (discharge, else surgery, else when it was added), so days before the
 * patient was home on it don't show as missed.
 */
export function adherenceByDay(
  medications: (ScheduleMedication & { countFrom: number })[],
  doseEvents: ScheduleDoseEvent[],
  timeZone: string,
  days: ReportDay[],
  now: number,
): DayAdherence[] {
  return days.map((day) => {
    const asOf = Math.min(now, day.end - 1);
    const slots = buildDaySchedule(medications, doseEvents, timeZone, asOf).filter((s) => {
      const med = medications.find((m) => m.id === s.medicationId);
      return med && s.scheduledFor >= med.countFrom && (s.status === "taken" || s.status === "missed");
    });
    return {
      date: day.date,
      taken: slots.filter((s) => s.status === "taken").length,
      counted: slots.length,
      missed: slots.filter((s) => s.status === "missed").map((s) => ({ name: s.name, time: s.time })),
    };
  });
}

/** Overall adherence as a whole percentage, or null when nothing was due yet. */
export function adherencePercent(days: DayAdherence[]): number | null {
  const counted = days.reduce((n, d) => n + d.counted, 0);
  if (counted === 0) return null;
  return Math.round((100 * days.reduce((n, d) => n + d.taken, 0)) / counted);
}

/** "Oct 24" style label for a date key. */
export function shortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
