// Pure helpers for turning medication "HH:mm" times into today's dose slots.
// Shared by the Next.js voice agent and Convex functions — no I/O here.

export type SlotStatus = "upcoming" | "due" | "taken" | "missed";

export interface ScheduleMedication {
  id: string;
  name: string;
  doseLabel: string;
  times: string[]; // "HH:mm" in the patient's time zone
  windowMinutes: number;
}

export interface ScheduleDoseEvent {
  medicationId: string;
  scheduledFor: number;
  status: string;
}

export interface DoseSlot {
  slotId: string; // `${medicationId}@${scheduledFor}`
  medicationId: string;
  name: string;
  doseLabel: string;
  time: string;
  scheduledFor: number;
  status: SlotStatus;
}

const MINUTE = 60_000;
// A dose event is matched to a slot if its scheduledFor is within this tolerance.
const SLOT_MATCH_TOLERANCE_MS = MINUTE;

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockIn(timeZone: string, at: number): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset (ms) to add to UTC to get wall-clock time in `timeZone` at instant `at`. */
export function timeZoneOffsetMs(timeZone: string, at: number): number {
  const w = wallClockIn(timeZone, at);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}

export function parseHhMm(time: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error(`Invalid "HH:mm" time: ${time}`);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** UTC ms for "HH:mm" on the same local calendar day as `now` in `timeZone`. */
export function localTimeToday(timeZone: string, time: string, now: number): number {
  const { hour, minute } = parseHhMm(time);
  const today = wallClockIn(timeZone, now);
  const naive = Date.UTC(today.year, today.month - 1, today.day, hour, minute);
  return naive - timeZoneOffsetMs(timeZone, naive);
}

export function formatLocalTime(timeZone: string, at: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
}

export function makeSlotId(medicationId: string, scheduledFor: number): string {
  return `${medicationId}@${scheduledFor}`;
}

export function parseSlotId(
  slotId: string,
): { medicationId: string; scheduledFor: number } | null {
  const at = slotId.lastIndexOf("@");
  if (at <= 0) return null;
  const scheduledFor = Number(slotId.slice(at + 1));
  if (!Number.isFinite(scheduledFor)) return null;
  return { medicationId: slotId.slice(0, at), scheduledFor };
}

function slotStatus(
  scheduledFor: number,
  windowMinutes: number,
  now: number,
  event: ScheduleDoseEvent | undefined,
): SlotStatus {
  if (event?.status === "taken") return "taken";
  const window = windowMinutes * MINUTE;
  if (now < scheduledFor - window) return "upcoming";
  if (now <= scheduledFor + window) return "due";
  return "missed";
}

/** Today's dose slots for the patient, sorted by time. */
export function buildDaySchedule(
  medications: ScheduleMedication[],
  doseEvents: ScheduleDoseEvent[],
  timeZone: string,
  now: number,
): DoseSlot[] {
  const slots = medications.flatMap((med) =>
    med.times.map((time) => {
      const scheduledFor = localTimeToday(timeZone, time, now);
      const event = doseEvents.find(
        (e) =>
          e.medicationId === med.id &&
          Math.abs(e.scheduledFor - scheduledFor) <= SLOT_MATCH_TOLERANCE_MS,
      );
      return {
        slotId: makeSlotId(med.id, scheduledFor),
        medicationId: med.id,
        name: med.name,
        doseLabel: med.doseLabel,
        time,
        scheduledFor,
        status: slotStatus(scheduledFor, med.windowMinutes, now, event),
      } satisfies DoseSlot;
    }),
  );
  return slots.sort((a, b) => a.scheduledFor - b.scheduledFor);
}

/** UTC ms bounds of the patient's current local day (used to query dose events). */
export function localDayBounds(timeZone: string, now: number): { start: number; end: number } {
  const start = localTimeToday(timeZone, "00:00", now);
  return { start, end: start + 24 * 60 * MINUTE };
}
