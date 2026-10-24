// What each care team member wants to be texted about. Pure, so Convex
// (convex/notify.ts, convex/summary.ts), the UI and the tests share one set of
// defaults. Rows store only what the member changed (`StoredPreferences`);
// everything else falls back to the "Just the important stuff" preset.

import { parseHhMm } from "../schedule";

export interface QuietHours {
  start: string; // "HH:mm" in the patient's time zone
  end: string;
}

export interface NotificationPreferences {
  /** Falls, SOS, serious symptoms. Always sent, even during quiet hours. */
  urgent: boolean;
  /** `notify` tier: missed medicine, red-flag check-ins. */
  headsUps: boolean;
  /** `ask` tier ("please check in"), which only ever goes to the owner. */
  askAlerts: boolean;
  dailySummary: boolean;
  summaryTime: string; // "HH:mm" in the patient's time zone
  /** Non-urgent texts are held and folded into the next daily summary. `null` is off. */
  quietHours: QuietHours | null;
}

/** As stored on `careTeamMembers.notifications`: every field optional so old rows stay valid. */
export type StoredPreferences = Partial<NotificationPreferences>;

export type PresetId = "everything" | "important" | "emergencies";

export const DEFAULT_QUIET_HOURS: QuietHours = { start: "22:00", end: "07:00" };
export const DEFAULT_SUMMARY_TIME = "19:00";
export const DEFAULT_PRESET: PresetId = "important";

type PresetValues = Omit<NotificationPreferences, "summaryTime">;

export interface PresetInfo {
  id: PresetId;
  title: string;
  body: string;
  values: PresetValues;
}

export const PRESETS: Record<PresetId, PresetInfo> = {
  everything: {
    id: "everything",
    title: "Everything",
    body: "Every alert as it happens, day or night, plus a daily summary.",
    values: { urgent: true, headsUps: true, askAlerts: true, dailySummary: true, quietHours: null },
  },
  important: {
    id: "important",
    title: "Just the important stuff",
    body: "Urgent alerts any time. Heads-ups like missed medicine during the day, and one summary each evening. Quiet from 10 PM to 7 AM.",
    values: {
      urgent: true,
      headsUps: true,
      askAlerts: true,
      dailySummary: true,
      quietHours: DEFAULT_QUIET_HOURS,
    },
  },
  emergencies: {
    id: "emergencies",
    title: "Emergencies only",
    body: "Only falls, SOS, and anything that sounds serious. No heads-ups, no summary.",
    values: { urgent: true, headsUps: false, askAlerts: false, dailySummary: false, quietHours: null },
  },
};

export const PRESET_ORDER: PresetId[] = ["important", "everything", "emergencies"];

/** Plain-language copy for each individual switch under "Customize". */
export const PREFERENCE_COPY = {
  urgent: {
    label: "Urgent alerts",
    body: "Falls, SOS, and anything the band hears that sounds serious. These always come through, even during quiet hours.",
  },
  headsUps: {
    label: "Heads-ups",
    body: "Missed medicine, and check-ins with a warning sign like a red or warm wound.",
  },
  askAlerts: {
    label: "“Please check in” requests",
    body: "When something needs a conversation, like not agreeing to share updates yet. Only the person who set Cadence up gets these.",
  },
  dailySummary: {
    label: "Daily summary",
    body: "One short text a day: medicines taken, pain, and anything that came up.",
  },
  quietHours: {
    label: "Quiet hours",
    body: "Heads-ups wait for the daily summary instead of buzzing you overnight. Urgent alerts still come through.",
  },
} as const;

/** Shown next to the urgent switch when it's off. A warning, not a block. */
export function urgentOffWarning(patientName: string): string {
  return `You won't get a text if ${patientName} falls, presses SOS, or says something that sounds serious. Make sure someone else on the team still does.`;
}

/** Shown on the hub when nobody with a phone would get an urgent text. */
export function teamUrgentGapWarning(patientName: string): string {
  return `Nobody will get a text if ${patientName} falls or presses SOS. Turn on urgent alerts and add a mobile number for at least one person.`;
}

/**
 * Full preferences for a member. `legacyUrgent` is the older
 * `careTeamMembers.urgentAlerts` flag, used until they choose for themselves.
 */
export function resolvePreferences(stored: StoredPreferences | undefined, legacyUrgent?: boolean): NotificationPreferences {
  const base = PRESETS[DEFAULT_PRESET].values;
  return {
    urgent: stored?.urgent ?? legacyUrgent ?? base.urgent,
    headsUps: stored?.headsUps ?? base.headsUps,
    askAlerts: stored?.askAlerts ?? base.askAlerts,
    dailySummary: stored?.dailySummary ?? base.dailySummary,
    summaryTime: stored?.summaryTime ?? DEFAULT_SUMMARY_TIME,
    quietHours: stored?.quietHours === undefined ? base.quietHours : stored.quietHours,
  };
}

/** Which preset these preferences match, or "custom". Exact quiet-hour times don't matter, only on or off. */
export function presetOf(prefs: NotificationPreferences): PresetId | "custom" {
  const match = PRESET_ORDER.find((id) => {
    const p = PRESETS[id].values;
    return (
      p.urgent === prefs.urgent &&
      p.headsUps === prefs.headsUps &&
      p.askAlerts === prefs.askAlerts &&
      p.dailySummary === prefs.dailySummary &&
      (p.quietHours === null) === (prefs.quietHours === null)
    );
  });
  return match ?? "custom";
}

/** Switch to a preset, keeping the member's own summary time and quiet-hour times. */
export function applyPreset(current: NotificationPreferences, id: PresetId): NotificationPreferences {
  const p = PRESETS[id].values;
  return {
    ...p,
    summaryTime: current.summaryTime,
    quietHours: p.quietHours && (current.quietHours ?? p.quietHours),
  };
}

function minutesOf(time: string): number {
  const { hour, minute } = parseHhMm(time);
  return hour * 60 + minute;
}

/** Minutes since local midnight in `timeZone`. */
export function localMinutes(timeZone: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: "hour" | "minute") => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** Whether `at` falls inside quiet hours (which may wrap past midnight). Equal start and end means never. */
export function inQuietHours(quiet: QuietHours | null, timeZone: string, at: number): boolean {
  if (!quiet) return false;
  const start = minutesOf(quiet.start);
  const end = minutesOf(quiet.end);
  if (start === end) return false;
  const now = localMinutes(timeZone, at);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** "10 PM–7 AM" */
export function formatQuietHours(quiet: QuietHours): string {
  return `${formatClock(quiet.start)}–${formatClock(quiet.end)}`;
}

/** "19:00" → "7 PM", "07:30" → "7:30 AM" */
export function formatClock(time: string): string {
  const { hour, minute } = parseHhMm(time);
  const suffix = hour < 12 ? "AM" : "PM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${h} ${suffix}` : `${h}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** Throws a readable error for bad input; returns the preferences unchanged otherwise. */
export function validatePreferences(prefs: NotificationPreferences): NotificationPreferences {
  const check = (time: string, field: string) => {
    try {
      parseHhMm(time);
    } catch {
      throw new Error(`${field} must be a time like 19:00`);
    }
  };
  check(prefs.summaryTime, "Summary time");
  if (prefs.quietHours) {
    check(prefs.quietHours.start, "Quiet hours start");
    check(prefs.quietHours.end, "Quiet hours end");
    if (prefs.quietHours.start === prefs.quietHours.end) throw new Error("Quiet hours need different start and end times");
  }
  return prefs;
}

/** One line for a member's row on the hub, e.g. "Just the important stuff · quiet 10 PM–7 AM". */
export function describePreferences(prefs: NotificationPreferences): string {
  const preset = presetOf(prefs);
  const name = preset === "custom" ? "Custom" : PRESETS[preset].title;
  const quiet = prefs.quietHours ? ` · quiet ${formatQuietHours(prefs.quietHours)}` : "";
  return `${name}${quiet}`;
}
