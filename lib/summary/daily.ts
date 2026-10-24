// The family's daily recovery text. Pure and rule-based (no LLM), so it's
// deterministic, cheap, and the tests pin exactly what goes out.
// Convex (convex/summary.ts) gathers the day and sends it.

import { recoveryStatus, type ProcedureId, procedureLabel } from "../onboarding/recovery";
import { localTimeToday, type DoseSlot } from "../schedule";

export const MAX_SUMMARY_LENGTH = 300;
/** The cron runs every 15 minutes; a slightly wider window survives jitter. Sends are de-duplicated per day. */
export const SUMMARY_WINDOW_MS = 20 * 60_000;

/** Whether a member's "HH:mm" summary time (patient's time zone) fell in the window ending now. */
export function summaryDue(summaryTime: string, timeZone: string, now: number, windowMs = SUMMARY_WINDOW_MS): boolean {
  const at = localTimeToday(timeZone, summaryTime, now);
  return at <= now && now - at < windowMs;
}

export interface SummaryCheckIn {
  at: number;
  state: "doing_well" | "sore_but_managing" | "struggling" | "unsure";
  painScore?: number;
  redFlag: boolean;
  notes?: string;
}

export interface SummaryAlert {
  tier: "info" | "ask" | "notify" | "urgent";
  reason: string;
  createdAt: number;
}

export interface DailySummaryInput {
  patientName: string;
  recovery?: { procedure: string; procedureOther?: string; surgeryDate: string };
  /** "YYYY-MM-DD" in the patient's time zone. */
  today: string;
  /** Today's dose slots (lib/schedule.ts), with statuses as of now. */
  slots: DoseSlot[];
  checkIns: SummaryCheckIn[];
  alerts: SummaryAlert[];
  events: { type: string; at: number }[];
  steps?: number;
  /** Texts held for this member during quiet hours since their last summary. */
  held?: { reason: string }[];
}

const STATE_TEXT: Record<SummaryCheckIn["state"], string> = {
  doing_well: "doing well",
  sore_but_managing: "sore but managing",
  struggling: "struggling",
  unsure: "unsure how they feel",
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function head(input: DailySummaryInput): string {
  if (!input.recovery) return `Cadence · ${input.patientName} today:`;
  const { day } = recoveryStatus(input.recovery.surgeryDate, input.today);
  const what = procedureLabel(input.recovery.procedure as ProcedureId, input.recovery.procedureOther).toLowerCase();
  if (day < 0) return `Cadence · ${input.patientName}, ${plural(-day, "day")} before ${what}:`;
  if (day === 0) return `Cadence · ${input.patientName}, surgery day (${what}):`;
  return `Cadence · ${input.patientName}, day ${day} after ${what}:`;
}

/** "took 6/6 medicines", "took 3/4 medicines so far (missed Apixaban 08:00)" */
function medicines(slots: DoseSlot[]): string | null {
  if (slots.length === 0) return null;
  const pastOrDone = slots.filter((s) => s.status !== "upcoming");
  const taken = slots.filter((s) => s.status === "taken").length;
  const missed = slots.filter((s) => s.status === "missed");
  const sofar = pastOrDone.length < slots.length ? " so far" : "";
  const base = `took ${taken}/${pastOrDone.length || slots.length} medicines${sofar}`;
  if (missed.length === 0) return base;
  const names = missed.map((s) => `${s.name} ${s.time}`);
  const list = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
  return `${base} (missed ${list})`;
}

/** "pain 5→3", "pain 4/10" */
function pain(checkIns: SummaryCheckIn[]): string | null {
  const scores = checkIns.filter((c) => typeof c.painScore === "number").map((c) => c.painScore!);
  if (scores.length === 0) return null;
  if (scores.length === 1) return `pain ${scores[0]}/10`;
  return `pain ${scores[0]}→${scores.at(-1)}`;
}

/** Warning signs, falls and SOS; "no warning signs" when the day was clear. */
function warnings(input: DailySummaryInput): string {
  const parts: string[] = [];
  const falls = input.events.filter((e) => e.type === "fall").length;
  const sos = input.events.filter((e) => e.type === "sos").length;
  if (falls) parts.push(plural(falls, "possible fall"));
  if (sos) parts.push(`SOS pressed${sos > 1 ? ` ${sos}×` : ""}`);
  const flags = input.checkIns.filter((c) => c.redFlag);
  if (flags.length) {
    const first = flags[0].notes ? `: ${clip(flags[0].notes, 60)}` : "";
    parts.push(`${plural(flags.length, "warning sign")}${first}`);
  }
  const urgent = input.alerts.filter((a) => a.tier === "urgent").length;
  if (urgent && !falls && !sos) parts.push(plural(urgent, "urgent alert"));
  return parts.length ? parts.join(", ") : "no warning signs";
}

/**
 * One short SMS about the day, e.g.
 * "Cadence · Margaret, day 5 after knee replacement: took 6/6 medicines, pain 5→3, no warning signs."
 * Optional details are dropped (least important first) to stay under MAX_SUMMARY_LENGTH.
 */
export function composeDailySummary(input: DailySummaryInput): string {
  const latest = input.checkIns.at(-1);
  const held = input.held?.length ?? 0;
  // [text, priority]: higher priority survives trimming.
  const parts: [string | null, number][] = [
    [medicines(input.slots), 5],
    [pain(input.checkIns), 4],
    [latest ? `last check-in: ${STATE_TEXT[latest.state]}` : "no check-ins yet", 2],
    [input.steps ? `${input.steps.toLocaleString("en-US")} steps` : null, 1],
    [warnings(input), 6],
  ];
  const heldLine = held ? ` Held in quiet hours: ${plural(held, "heads-up")} (${clip(input.held![0].reason, 60)}).` : "";

  const build = (keep: [string | null, number][], heldText: string) =>
    `${head(input)} ${keep
      .map(([t]) => t)
      .filter(Boolean)
      .join(", ")}.${heldText}`;

  let keep = parts.filter(([t]) => t);
  let heldText = heldLine;
  let text = build(keep, heldText);
  // Drop the least important details until it fits.
  while (text.length > MAX_SUMMARY_LENGTH && keep.length > 1) {
    const lowest = keep.reduce((min, p) => (p[1] < min[1] ? p : min));
    keep = keep.filter((p) => p !== lowest);
    text = build(keep, heldText);
  }
  if (text.length > MAX_SUMMARY_LENGTH && heldText) {
    heldText = ` Held in quiet hours: ${plural(held, "heads-up")}.`;
    text = build(keep, heldText);
  }
  return clip(text, MAX_SUMMARY_LENGTH);
}
