import { z } from "zod";

// Post-op recovery profile captured during onboarding. Shared by the setup
// wizard, Convex, and the voice agent's system prompt.

export const PROCEDURES = [
  { id: "hip_replacement", label: "Hip replacement" },
  { id: "knee_replacement", label: "Knee replacement" },
  { id: "heart_surgery", label: "Heart surgery" },
  { id: "abdominal_surgery", label: "Abdominal surgery" },
  { id: "spine_surgery", label: "Spine surgery" },
  { id: "other", label: "Something else" },
] as const;

export type ProcedureId = (typeof PROCEDURES)[number]["id"];
export const procedureId = z.enum(PROCEDURES.map((p) => p.id) as [ProcedureId, ...ProcedureId[]]);

export function procedureLabel(id: ProcedureId, other?: string): string {
  if (id === "other" && other?.trim()) return other.trim();
  return PROCEDURES.find((p) => p.id === id)?.label ?? "Surgery";
}

export type RecoveryPhase = "pre_op" | "first_days" | "early" | "strengthening" | "routine";

interface PhaseInfo {
  /** First post-op day (inclusive) of this phase. */
  fromDay: number;
  label: string;
  /** What the voice agent should keep an eye on during this phase. */
  focus: string;
}

export const PHASES: Record<RecoveryPhase, PhaseInfo> = {
  pre_op: {
    fromDay: -Infinity,
    label: "Before surgery",
    focus: "Help them stay on their pre-op instructions and feel calm about the day.",
  },
  first_days: {
    fromDay: 0,
    label: "First days home",
    focus:
      "Pain control, rest, drinking fluids, and warning signs: fever, a wound that is red, hot or leaking, calf pain or swelling, shortness of breath.",
  },
  early: {
    fromDay: 4,
    label: "Early recovery",
    focus: "Moving a little more each day, wound healing, sleep, appetite, and taking pain medicine as prescribed.",
  },
  strengthening: {
    fromDay: 15,
    label: "Getting stronger",
    focus: "Keeping up with exercises or physio, energy levels, mood, and easing off pain medicine as advised.",
  },
  routine: {
    fromDay: 43,
    label: "Back to routine",
    focus: "Lighter touch: mood, activity, and any pain that is not improving.",
  },
};

const PHASE_ORDER: RecoveryPhase[] = ["routine", "strengthening", "early", "first_days", "pre_op"];

export interface RecoveryStatus {
  /** Days since surgery; surgery day is 0 and negative means it hasn't happened yet. */
  day: number;
  phase: RecoveryPhase;
  label: string;
}

/** "YYYY-MM-DD" for `now` in the given time zone. */
export function localDateKey(timeZone: string, now: number): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(now),
  );
}

const DAY_MS = 86_400_000;

function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Where the patient is in recovery, from two calendar dates ("YYYY-MM-DD"). */
export function recoveryStatus(surgeryDate: string, today: string): RecoveryStatus {
  const day = dayNumber(today) - dayNumber(surgeryDate);
  const phase = PHASE_ORDER.find((p) => day >= PHASES[p].fromDay) ?? "pre_op";
  const when =
    day < 0 ? `Surgery in ${-day} day${day === -1 ? "" : "s"}` : day === 0 ? "Surgery day" : `Day ${day} after surgery`;
  return { day, phase, label: `${when} · ${PHASES[phase].label}` };
}

/**
 * How often the band checks in on its own in each phase: three times a day in
 * the first days home, easing to every other day once life is back to routine.
 */
export const CHECK_IN_CADENCE: Record<RecoveryPhase, { perDay: number; everyOtherDay?: boolean }> = {
  pre_op: { perDay: 0 },
  first_days: { perDay: 3 },
  early: { perDay: 2 },
  strengthening: { perDay: 1 },
  routine: { perDay: 1, everyOtherDay: true },
};

/** Scheduled check-ins for a given post-op day (0 on the off days of "every other day"). */
export function checkInsForDay(status: Pick<RecoveryStatus, "day" | "phase">): number {
  const cadence = CHECK_IN_CADENCE[status.phase];
  if (cadence.everyOtherDay && status.day % 2 !== 0) return 0;
  return cadence.perDay;
}
