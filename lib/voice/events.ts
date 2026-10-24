import { z } from "zod";
import { checkInsForDay, type RecoveryStatus } from "../onboarding/recovery";
import { localTimeToday, parseHhMm, type DoseSlot } from "../schedule";

// Things the wearable can report that make the agent speak first.
export const wearableEvent = z.enum([
  "dose_due",
  "missed_dose",
  "check_in",
  "low_activity",
  "fall",
  "sos",
  "first_boot",
]);
export type WearableEvent = z.infer<typeof wearableEvent>;

export const EVENT_LABELS: Record<WearableEvent, string> = {
  dose_due: "Medication due",
  missed_dose: "Missed dose follow-up",
  check_in: "Scheduled check-in",
  low_activity: "Inactive for hours",
  fall: "Possible fall detected",
  sos: "SOS button pressed",
  first_boot: "First time on the wrist",
};

/** Events that are also logged to the `events` table for the care team. */
export const SAFETY_EVENTS = ["fall", "sos"] as const satisfies readonly WearableEvent[];
export type SafetyEvent = (typeof SAFETY_EVENTS)[number];

export function isSafetyEvent(event: WearableEvent): event is SafetyEvent {
  return (SAFETY_EVENTS as readonly WearableEvent[]).includes(event);
}

export type CheckInTrigger = "scheduled" | "low_activity" | "fall" | "manual";

export function checkInTriggerFor(event: WearableEvent | null): CheckInTrigger {
  if (event === "fall") return "fall";
  if (event === "low_activity") return "low_activity";
  if (event === "check_in") return "scheduled";
  return "manual";
}

/** Dose slots that should trigger a proactive reminder right now. */
export function dueSlots(slots: DoseSlot[]): DoseSlot[] {
  return slots.filter((s) => s.status === "due");
}

/**
 * Slots a dose event is about. A forced "dose_due" (debug button) with nothing
 * actually due falls back to the next upcoming dose, else the latest missed one,
 * so the reminder always names a real medication.
 */
export function slotsForEvent(event: WearableEvent, slots: DoseSlot[]): DoseSlot[] {
  if (event === "missed_dose") return slots.filter((s) => s.status === "missed");
  if (event !== "dose_due") return [];

  const due = dueSlots(slots);
  if (due.length) return due;
  const next = slots.find((s) => s.status === "upcoming");
  const fallback = next ?? slots.filter((s) => s.status === "missed").at(-1);
  if (!fallback) return [];
  // Doses scheduled at the same time are reminded together.
  return slots.filter((s) => s.scheduledFor === fallback.scheduledFor && s.status !== "taken");
}

function listSlots(slots: DoseSlot[]): string {
  return slots.map((s) => `${s.name} (${s.doseLabel}) at ${s.time}`).join("; ");
}

/** The line Claude sees (as user-side context) when the wearable starts a conversation. */
export function describeEvent(event: WearableEvent, slots: DoseSlot[]): string {
  switch (event) {
    case "dose_due":
      return slots.length
        ? `[Wearable event] Medication reminder: ${listSlots(slots)}. Remind the patient and ask them to tell you once they've taken it.`
        : "[Wearable event] Medication reminder, but every dose today is already taken. Let the patient know they're all caught up.";
    case "missed_dose":
      return slots.length
        ? `[Wearable event] These doses were not confirmed in their window: ${listSlots(slots)}. Gently ask whether they took them. Do not tell them to double up; if they're unsure, suggest checking with their care team.`
        : "[Wearable event] Missed-dose check, but no doses are missed today. Briefly reassure the patient they're on track.";
    case "check_in":
      return "[Wearable event] Scheduled check-in. Ask the patient how they're feeling and moving right now.";
    case "low_activity":
      return "[Wearable event] The wristband says they've barely moved in several hours. Ask kindly how they're feeling, and if their care plan allows, encourage a short walk or some ankle pumps to help circulation. Don't push if they're in pain or were told to rest. Then record a check-in.";
    case "fall":
      return "[Wearable event] Possible fall detected by the wristband. Ask right away if they are OK and whether they need help.";
    case "sos":
      return "[Wearable event] The patient pressed the SOS button on the wristband. Alert the care team as urgent right away, tell them help is being notified, and ask what's happening.";
    case "first_boot":
      return "[Wearable event] The band was just paired and put on for the first time. Introduce yourself in one sentence, then ask whether it's okay for you to let the people listed under Care team know if they fall, miss medicine, or seem unwell, naming those people. When they answer, call record_consent.";
  }
}

/** Stable key so a client only plays one reminder per set of due slots. */
export function nudgeKey(slots: DoseSlot[]): string {
  return slots.map((s) => s.slotId).sort().join(",");
}

// ---- Scheduled check-ins -------------------------------------------------

/** When the band may start a check-in on its own ("HH:mm", patient's time zone). */
export const WAKING_HOURS = { start: "09:00", end: "21:00" } as const;
const STEP_MINUTES = 15;
// A check-in this long before a slot still counts for it, so the band doesn't ask twice in an hour.
const COVER_LEAD_MINUTES = 60;

export interface DoseTime {
  time: string; // "HH:mm"
  windowMinutes: number;
}

const toMinutes = (time: string) => {
  const { hour, minute } = parseHhMm(time);
  return hour * 60 + minute;
};
const toHhMm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * `count` check-in times spread evenly across waking hours, each nudged (in
 * 15-minute steps, later first, then earlier) out of every dose's reminder
 * window so a check-in never talks over a dose reminder.
 */
export function scheduledCheckInTimes(count: number, doses: DoseTime[], waking = WAKING_HOURS): string[] {
  if (count <= 0) return [];
  const start = toMinutes(waking.start);
  const end = toMinutes(waking.end);
  const span = end - start;
  const clashes = (m: number) => doses.some((d) => Math.abs(m - toMinutes(d.time)) <= d.windowMinutes);
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    const ideal = Math.round((start + ((i + 0.5) * span) / count) / STEP_MINUTES) * STEP_MINUTES;
    const taken = (m: number) => times.includes(m);
    let pick: number | null = null;
    for (let shift = 0; shift <= span && pick === null; shift += STEP_MINUTES) {
      for (const m of [ideal + shift, ideal - shift]) {
        if (m >= start && m < end && !clashes(m) && !taken(m)) {
          pick = m;
          break;
        }
      }
    }
    // A day packed with doses: keep the ideal time; the nudge route still won't speak over a due dose.
    times.push(pick ?? ideal);
  }
  return times.sort((a, b) => a - b).map(toHhMm);
}

export interface ScheduledCheckIn {
  time: string;
  scheduledFor: number;
  /** Nudge key, so the band asks once per slot even if it polls every 30 seconds. */
  key: string;
}

/**
 * The scheduled check-in to start right now, if any: today's current slot
 * (from its time until the next slot or the end of waking hours) when no
 * check-in has happened in it yet.
 */
export function dueScheduledCheckIn(args: {
  recovery: Pick<RecoveryStatus, "day" | "phase"> | null;
  doses: DoseTime[];
  checkInTimes: number[];
  timeZone: string;
  now: number;
}): ScheduledCheckIn | null {
  if (!args.recovery) return null;
  const times = scheduledCheckInTimes(checkInsForDay(args.recovery), args.doses);
  const at = times.map((t) => localTimeToday(args.timeZone, t, args.now));
  const wakeEnd = localTimeToday(args.timeZone, WAKING_HOURS.end, args.now);
  const i = at.findLastIndex((t) => t <= args.now);
  if (i === -1) return null;
  const slotEnd = at[i + 1] ?? wakeEnd;
  if (args.now >= slotEnd) return null;
  const covered = args.checkInTimes.some((c) => c >= at[i] - COVER_LEAD_MINUTES * 60_000 && c <= args.now);
  if (covered) return null;
  return { time: times[i], scheduledFor: at[i], key: `check_in@${at[i]}` };
}
