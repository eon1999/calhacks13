// Simulated recovery history for the demo patient (convex/seed.ts). Every row
// it produces belongs to a patient flagged `isDemo`, and every screen labels
// that data as simulated. Deterministic: the same `now` gives the same history.
//
// The story: two weeks home after a knee replacement. Pain falls from ~7 to ~3,
// steps climb, a few 2 PM doses are missed, pain runs higher late after a dose,
// one possible fall (she was fine), one red-looking wound reported early on.

import { localTimeToday } from "./schedule";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface HistoryMedication {
  id: string;
  name: string;
  times: string[];
  windowMinutes: number;
}

type DoseStatus = "opened" | "taken" | "late" | "missed" | "extra_opening";

export interface HistoryDose {
  medicationId: string;
  scheduledFor: number;
  status: DoseStatus;
  openedAt?: number;
  confirmedAt?: number;
  source?: "pillbox" | "voice";
  remindersSent: number;
}

export interface HistoryCheckIn {
  at: number;
  trigger: "scheduled" | "low_activity" | "fall" | "manual";
  transcript: string;
  state: "doing_well" | "sore_but_managing" | "struggling" | "unsure";
  painScore?: number;
  notes?: string;
  redFlag: boolean;
}

export interface HistoryEvent {
  type: "fall" | "lid_open" | "device_offline";
  at: number;
  payload?: Record<string, unknown>;
  resolution?: "ok" | "helped" | "unresolved";
}

export interface HistoryAlert {
  tier: "info" | "notify" | "urgent";
  kind: string;
  reason: string;
  createdAt: number;
  status: "acknowledged" | "resolved";
  acknowledgedBy: string;
  acknowledgedAt: number;
}

export interface HistoryActivity {
  windowStart: number;
  steps: number;
  activeMinutes: number;
  heartRate: number;
}

export interface DemoHistory {
  doses: HistoryDose[];
  checkIns: HistoryCheckIn[];
  events: HistoryEvent[];
  alerts: HistoryAlert[];
  activity: HistoryActivity[];
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo);

// Fixed story beats, by day index (0 = first full day home).
const MISSED = new Set(["2@14:00", "6@14:00", "9@14:00", "4@20:00"]);
const LATE = new Set(["1@08:00", "7@20:00", "10@14:00"]);
const OPENED_ONLY = new Set(["5@08:00"]);
const FALL_DAY = 5;
const RED_FLAG_DAY = 3;
const EXTRA_OPENING_DAY = 11;
const OFFLINE_DAY = 8;

function painFor(day: number, days: number, hoursSinceDose: number, r: () => number): number {
  const progress = days > 1 ? day / (days - 1) : 1;
  const base = 6.8 - 4 * progress; // ~7 → ~3 over the period
  const wearingOff = hoursSinceDose >= 4 ? 1.8 : hoursSinceDose >= 2 ? 0.6 : 0;
  return Math.max(0, Math.min(10, Math.round(base + wearingOff + between(r, -0.7, 0.7))));
}

function stateFor(pain: number): HistoryCheckIn["state"] {
  if (pain >= 7) return "struggling";
  if (pain >= 4) return "sore_but_managing";
  return "doing_well";
}

const FEELINGS: Record<HistoryCheckIn["state"], string[]> = {
  struggling: ["It's really aching today.", "Not great, the knee is throbbing.", "Rough morning, hard to get comfortable."],
  sore_but_managing: ["Sore, but I'm managing.", "A bit stiff, the walker helps.", "It aches, but better than yesterday."],
  doing_well: ["Pretty good today.", "Feeling more like myself.", "Good, I walked to the mailbox."],
  unsure: ["I'm not sure, hard to say.", "Okay, I think.", "Hard to tell today."],
};

/**
 * History for the `days` local days before today, plus today up to `now`
 * (today's open dose windows are left for the live dose engine).
 */
export function generateDemoHistory(opts: {
  medications: HistoryMedication[];
  timeZone: string;
  now: number;
  days?: number;
  firstName?: string;
  carePartner?: string;
}): DemoHistory {
  const { medications, timeZone, now } = opts;
  const days = opts.days ?? 14;
  const name = opts.firstName ?? "Margaret";
  const partner = opts.carePartner ?? "Sarah";
  const r = rng(Math.floor(now / DAY));
  const history: DemoHistory = { doses: [], checkIns: [], events: [], alerts: [], activity: [] };
  const fmt = (at: number) =>
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(at));

  for (let day = 0; day <= days; day++) {
    const anchor = now - (days - day) * DAY;
    const isToday = day === days;
    const at = (time: string) => localTimeToday(timeZone, time, anchor);
    const takenToday: number[] = [];

    // Doses
    const times = [...new Set(medications.flatMap((m) => m.times))].sort();
    for (const time of times) {
      const t = at(time);
      const meds = medications.filter((m) => m.times.includes(time));
      const window = Math.max(...meds.map((m) => m.windowMinutes)) * MINUTE;
      if (t + window >= now) continue; // still open (or future): the live engine owns it
      const key = `${day}@${time}`;

      if (MISSED.has(key)) {
        for (const m of meds) history.doses.push({ medicationId: m.id, scheduledFor: t, status: "missed", remindersSent: 2 });
        const ack = t + window + between(r, 6, 25) * MINUTE;
        history.alerts.push({
          tier: "notify",
          kind: "missed_dose",
          reason: `${name} hasn't taken the ${fmt(t)} dose (${meds.map((m) => m.name).join(", ")}) after two reminders.`,
          createdAt: t + window,
          status: "acknowledged",
          acknowledgedBy: `${partner}: I called her`,
          acknowledgedAt: ack,
        });
        continue;
      }

      const late = LATE.has(key);
      const openedOnly = OPENED_ONLY.has(key);
      const openedAt = late ? t + window + between(r, 5, 25) * MINUTE : t + between(r, -15, 20) * MINUTE;
      const confirmedAt = openedAt + between(r, 0.5, 3) * MINUTE;
      for (const m of meds) {
        history.doses.push({
          medicationId: m.id,
          scheduledFor: t,
          status: openedOnly ? "opened" : late ? "late" : "taken",
          openedAt,
          confirmedAt: openedOnly ? undefined : confirmedAt,
          source: "pillbox",
          remindersSent: late ? 2 : openedAt > t ? 1 : 0,
        });
      }
      history.events.push({ type: "lid_open", at: openedAt, payload: { deviceId: "box-01", match: "dose", simulated: true } });
      takenToday.push(openedAt);

      if (day === EXTRA_OPENING_DAY && time === times[0]) {
        const extraAt = openedAt + 38 * MINUTE;
        history.doses.push({ medicationId: meds[0].id, scheduledFor: extraAt, status: "extra_opening", openedAt: extraAt, source: "pillbox", remindersSent: 0 });
        history.events.push({ type: "lid_open", at: extraAt, payload: { deviceId: "box-01", match: "extra", simulated: true } });
        history.alerts.push({
          tier: "notify",
          kind: "extra_opening",
          reason: `${name} opened the pillbox again at ${fmt(extraAt)}, after taking a dose at ${fmt(openedAt)}. Cadence reminded them; nothing was blocked.`,
          createdAt: extraAt,
          status: "acknowledged",
          acknowledgedBy: `${partner}: Talked it through, she's fine`,
          acknowledgedAt: extraAt + 14 * MINUTE,
        });
      }
    }

    const sinceDose = (at: number) => {
      const before = takenToday.filter((x) => x <= at);
      return before.length ? (at - Math.max(...before)) / HOUR : 6;
    };

    // Check-ins: mid-morning (soon after the 8 AM dose) and early afternoon (wearing off before 2 PM).
    for (const [time, trigger] of [
      ["09:40", "scheduled"],
      ["13:20", day % 3 === 1 ? "low_activity" : "scheduled"],
    ] as const) {
      const when = at(time) + between(r, -10, 10) * MINUTE;
      if (when >= now) continue;
      const pain = painFor(day, days, sinceDose(when), r);
      let state = stateFor(pain);
      let notes: string | undefined;
      let redFlag = false;
      let transcript = FEELINGS[state][Math.floor(r() * 3)];
      if (day === RED_FLAG_DAY && time === "13:20") {
        redFlag = true;
        state = "sore_but_managing";
        notes = "Says the skin around the incision looks a bit red and warm. No fever.";
        transcript = "The skin by the cut looks a bit red, and it feels warm.";
        history.alerts.push({
          tier: "notify",
          kind: "red_flag",
          reason: `Check-in red flag: ${notes}`,
          createdAt: when,
          status: "acknowledged",
          acknowledgedBy: `${partner}: Called the surgeon's nurse line; they'll look at it Thursday`,
          acknowledgedAt: when + 40 * MINUTE,
        });
      }
      history.checkIns.push({
        at: when,
        trigger,
        transcript: `${transcript} Maybe a ${pain} out of 10.`,
        state,
        painScore: pain,
        notes,
        redFlag,
      });
    }

    // Possible fall, answered "I'm fine".
    if (day === FALL_DAY) {
      const fallAt = at("15:12");
      if (fallAt < now) {
        history.events.push({ type: "fall", at: fallAt, payload: { peakG: 2.9, deviceId: "band-01", simulated: true }, resolution: "ok" });
        history.checkIns.push({
          at: fallAt + 20_000,
          trigger: "fall",
          transcript: "I'm fine, I just sat down hard on the bed.",
          state: "doing_well",
          redFlag: false,
          notes: "Sat down hard on the bed; not hurt.",
        });
        history.alerts.push({
          tier: "info",
          kind: "fall_check",
          reason: "Possible fall; they said they're okay, so nobody was alerted.",
          createdAt: fallAt + 20_000,
          status: "resolved",
          acknowledgedBy: "Said they're okay",
          acknowledgedAt: fallAt + 20_000,
        });
      }
    }

    if (day === OFFLINE_DAY) {
      const offAt = at("11:05");
      history.events.push({ type: "device_offline", at: offAt, payload: { deviceId: "band-01", simulated: true } });
      history.alerts.push({
        tier: "notify",
        kind: "device_offline",
        reason: "The wristband (band-01) hasn't checked in for 15 minutes. Check it's charged and on Wi-Fi.",
        createdAt: offAt,
        status: "resolved",
        acknowledgedBy: "Back online",
        acknowledgedAt: offAt + 34 * MINUTE,
      });
    }

    // Activity: hourly windows while awake; steps grow through recovery.
    const progress = day / days;
    const dailySteps = 500 + 3200 * progress;
    for (let hour = 7; hour <= 21; hour++) {
      const start = at(`${String(hour).padStart(2, "0")}:00`);
      if (start >= now - HOUR) continue;
      if (isToday && start >= now) continue;
      if (day === OFFLINE_DAY && hour === 11) continue;
      const walkHour = hour === 10 || hour === 15 || hour === 18;
      const share = walkHour ? 0.18 : 0.035;
      const steps = Math.max(0, Math.round(dailySteps * share * between(r, 0.6, 1.4)));
      history.activity.push({
        windowStart: start,
        steps,
        activeMinutes: Math.min(60, Math.round(steps / 90)),
        heartRate: Math.round(76 - 4 * progress + (walkHour ? 12 : 0) + between(r, -4, 4)),
      });
    }
  }

  return history;
}
