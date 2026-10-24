// The dose engine's rules, as pure functions. convex/doses.ts runs them every
// minute and on every lid opening; the tests pin down the timings.
//
//   T - window ........ T ....... T+15 ....... T + window ....... T+90
//   dose row "due"   reminder 1  reminder 2   missed + care alert   (late opening still counts)
//
// "Opened" (pillbox lid) and "taken" (voice confirmation) are separate states:
// opening is not swallowing.

import { formatLocalTime, localTimeToday } from "./schedule";

const MINUTE = 60_000;
export const SECOND_REMINDER_AFTER_MS = 15 * MINUTE;
/** A lid opening this long after T still counts toward the dose, as "late". */
export const LATE_LIMIT_MS = 90 * MINUTE;
/** Opening the box again within this long of a taken dose gets a spoken warning. */
export const EXTRA_OPENING_WINDOW_MS = 120 * MINUTE;
/** Reminders and alerts for moments further in the past than this are skipped, not fired late. */
export const STALE_MS = 10 * MINUTE;
/** Missed doses older than this are left alone (e.g. the first tick after a deploy). */
const BACKFILL_MS = 6 * 60 * MINUTE;

export type DoseStatus = "due" | "opened" | "taken" | "late" | "missed" | "extra_opening";

export interface EngineMedication {
  id: string;
  name: string;
  doseLabel: string;
  times: string[];
  windowMinutes: number;
  createdAt: number;
}

export interface EngineDose {
  id: string;
  medicationId: string;
  scheduledFor: number;
  status: DoseStatus;
  openedAt?: number;
  confirmedAt?: number;
  remindersSent?: number;
}

export interface EngineSlot {
  medicationId: string;
  name: string;
  doseLabel: string;
  scheduledFor: number;
  windowMs: number;
  /** False when the medicine was added after this dose time; no row is created for it. */
  eligible: boolean;
  dose?: EngineDose;
}

const SLOT_MATCH_TOLERANCE_MS = MINUTE;

/** Dose slots for yesterday and today (local), so late-evening windows survive midnight. */
export function engineSlots(
  medications: EngineMedication[],
  doses: EngineDose[],
  timeZone: string,
  now: number,
): EngineSlot[] {
  const slots: EngineSlot[] = [];
  for (const dayOffset of [-1, 0]) {
    const anchor = now + dayOffset * 24 * 60 * MINUTE;
    for (const med of medications) {
      for (const time of med.times) {
        const scheduledFor = localTimeToday(timeZone, time, anchor);
        const dose = doses.find(
          (d) =>
            d.medicationId === med.id &&
            d.status !== "extra_opening" &&
            Math.abs(d.scheduledFor - scheduledFor) <= SLOT_MATCH_TOLERANCE_MS,
        );
        slots.push({
          medicationId: med.id,
          name: med.name,
          doseLabel: med.doseLabel,
          scheduledFor,
          windowMs: med.windowMinutes * MINUTE,
          // A minute of slack so "add a dose due now" in the demo still counts.
          eligible: med.createdAt <= scheduledFor + MINUTE,
          dose,
        });
      }
    }
  }
  return slots.sort((a, b) => a.scheduledFor - b.scheduledFor);
}

export interface SlotGroup {
  scheduledFor: number;
  slots: EngineSlot[];
}

export interface TickPlan {
  /** Slots that need a dose row (status "due" unless also listed in `missed`). */
  create: EngineSlot[];
  /** Reminders to speak now, one per dose time. `n` is 1 at T, 2 at T+15 (with a band buzz). */
  reminders: (SlotGroup & { n: 1 | 2 })[];
  /** Slots whose window closed without an opening or confirmation. */
  missed: EngineSlot[];
  /** Dose times to tell the care team about (fresh misses only). */
  missedAlerts: SlotGroup[];
}

function groupByTime(slots: EngineSlot[]): SlotGroup[] {
  const groups = new Map<number, EngineSlot[]>();
  for (const s of slots) groups.set(s.scheduledFor, [...(groups.get(s.scheduledFor) ?? []), s]);
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([scheduledFor, group]) => ({ scheduledFor, slots: group }));
}

/** What the every-minute tick should do right now. */
export function planTick(slots: EngineSlot[], now: number): TickPlan {
  const create: EngineSlot[] = [];
  const missed: EngineSlot[] = [];
  const missedFresh: EngineSlot[] = [];
  const remind1: EngineSlot[] = [];
  const remind2: EngineSlot[] = [];

  for (const slot of slots) {
    const { dose, scheduledFor: t, windowMs } = slot;
    if (dose && dose.status !== "due") continue; // opened, taken, late or missed: nothing to do
    if (!dose && !slot.eligible) continue;
    if (now < t - windowMs) continue; // not yet in its window

    const closesAt = t + windowMs;
    if (now > closesAt) {
      if (!dose && now - closesAt > BACKFILL_MS) continue;
      if (!dose) create.push(slot);
      missed.push(slot);
      if (now - closesAt <= STALE_MS) missedFresh.push(slot);
      continue;
    }

    if (!dose) create.push(slot);
    const sent = dose?.remindersSent ?? 0;
    const second = t + SECOND_REMINDER_AFTER_MS;
    if (sent < 2 && now >= second && second < closesAt && now - second <= STALE_MS) remind2.push(slot);
    else if (sent < 1 && now >= t && now - t <= STALE_MS) remind1.push(slot);
  }

  return {
    create,
    missed,
    missedAlerts: groupByTime(missedFresh),
    reminders: [
      ...groupByTime(remind1).map((g) => ({ ...g, n: 1 as const })),
      ...groupByTime(remind2).map((g) => ({ ...g, n: 2 as const })),
    ].sort((a, b) => a.scheduledFor - b.scheduledFor),
  };
}

function takenAt(dose: EngineDose | undefined): number | undefined {
  if (!dose) return undefined;
  if (dose.status === "taken" || dose.status === "opened" || dose.status === "late") {
    return dose.confirmedAt ?? dose.openedAt;
  }
  return undefined;
}

export type LidOpenMatch =
  | { kind: "dose"; scheduledFor: number; slots: EngineSlot[]; late: boolean }
  | { kind: "extra"; slots: EngineSlot[]; lastTakenAt: number }
  | { kind: "none" };

/**
 * Which dose a pillbox opening belongs to. Doses at the same time share a
 * compartment, so they're opened together. Prefers the dose time closest to now.
 */
export function matchLidOpen(slots: EngineSlot[], now: number): LidOpenMatch {
  const open = slots.filter((s) => {
    const status = s.dose?.status;
    const pending = status === undefined || status === "due" || status === "missed";
    if (!pending || (!s.dose && !s.eligible)) return false;
    return now >= s.scheduledFor - s.windowMs && now <= s.scheduledFor + Math.max(LATE_LIMIT_MS, s.windowMs);
  });
  if (open.length) {
    const nearest = open.reduce((best, s) =>
      Math.abs(s.scheduledFor - now) < Math.abs(best.scheduledFor - now) ? s : best,
    );
    const group = open.filter((s) => s.scheduledFor === nearest.scheduledFor);
    return {
      kind: "dose",
      scheduledFor: nearest.scheduledFor,
      slots: group,
      late: now > nearest.scheduledFor + nearest.windowMs,
    };
  }

  const recent = slots.filter((s) => {
    const at = takenAt(s.dose);
    return at !== undefined && at <= now && now - at <= EXTRA_OPENING_WINDOW_MS;
  });
  if (recent.length) {
    const lastTakenAt = Math.max(...recent.map((s) => takenAt(s.dose) ?? 0));
    return { kind: "extra", slots: recent, lastTakenAt };
  }
  return { kind: "none" };
}

export type LedState = "due" | "taken" | "missed" | "off";

/** The med station's LED: blue while a dose is due, red after a miss, green right after taking. */
export function ledState(slots: EngineSlot[], now: number): LedState {
  const inWindow = (s: EngineSlot) => now >= s.scheduledFor - s.windowMs && now <= s.scheduledFor + s.windowMs;
  if (slots.some((s) => inWindow(s) && (s.dose ? s.dose.status === "due" : s.eligible))) return "due";
  const recentlyMissed = slots.some(
    (s) => s.dose?.status === "missed" && now - (s.scheduledFor + s.windowMs) <= 2 * 60 * MINUTE,
  );
  if (recentlyMissed) return "missed";
  const recentlyTaken = slots.some((s) => {
    const at = takenAt(s.dose);
    return at !== undefined && now - at <= 30 * MINUTE;
  });
  return recentlyTaken ? "taken" : "off";
}

// ---------------------------------------------------------------------------
// Wording (care partner alerts and hub prompts)
// ---------------------------------------------------------------------------

function names(slots: EngineSlot[]): string {
  const list = [...new Set(slots.map((s) => s.name))];
  if (list.length <= 1) return list[0] ?? "medicine";
  return `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

export function reminderReason(firstName: string, group: SlotGroup, n: 1 | 2, timeZone: string): string {
  const when = formatLocalTime(timeZone, group.scheduledFor);
  const prefix = n === 2 ? "Second reminder" : "Reminder";
  return `${prefix}: ${firstName}'s ${when} ${names(group.slots)}`;
}

export function missedReason(firstName: string, group: SlotGroup, timeZone: string): string {
  const when = formatLocalTime(timeZone, group.scheduledFor);
  return `${firstName} hasn't taken the ${when} dose (${names(group.slots)}) after two reminders.`;
}

export function extraOpeningReason(firstName: string, lastTakenAt: number, at: number, timeZone: string): string {
  return `${firstName} opened the pillbox again at ${formatLocalTime(timeZone, at)}, after taking a dose at ${formatLocalTime(timeZone, lastTakenAt)}. Cadence reminded them; nothing was blocked.`;
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export interface ActivityWindow {
  windowStart: number;
  steps: number;
}

export const LOW_ACTIVITY_SPAN_MS = 3 * 60 * MINUTE;

/**
 * Long stillness while awake (clot risk after surgery): the band has been
 * reporting for the last 3 hours (recent sample, and coverage back to the
 * start) and none of it had steps. Waking hours are 08:00–21:00 local.
 */
export function isLowActivity(samples: ActivityWindow[], now: number, localHour: number): boolean {
  if (localHour < 8 || localHour >= 21) return false;
  const since = now - LOW_ACTIVITY_SPAN_MS;
  const recent = samples.filter((s) => s.windowStart >= since - 10 * MINUTE && s.windowStart <= now);
  if (recent.length === 0) return false;
  const newest = Math.max(...recent.map((s) => s.windowStart));
  const oldest = Math.min(...recent.map((s) => s.windowStart));
  if (now - newest > 15 * MINUTE) return false; // band isn't reporting
  if (oldest > since + 15 * MINUTE) return false; // not enough history yet
  return recent.every((s) => s.steps === 0);
}
