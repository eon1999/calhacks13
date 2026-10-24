import { describe, expect, it } from "vitest";
import {
  applyPreset,
  DEFAULT_QUIET_HOURS,
  describePreferences,
  formatClock,
  inQuietHours,
  presetOf,
  PRESETS,
  resolvePreferences,
  validatePreferences,
} from "./preferences";

const TZ = "America/Los_Angeles";
// 2026-10-24 is PDT (UTC-7).
const pdt = (hhmm: string) => Date.parse(`2026-10-24T${hhmm}:00-07:00`);

describe("resolvePreferences", () => {
  it("defaults to 'Just the important stuff' for rows that never chose", () => {
    const prefs = resolvePreferences(undefined);
    expect(presetOf(prefs)).toBe("important");
    expect(prefs.quietHours).toEqual(DEFAULT_QUIET_HOURS);
    expect(prefs.summaryTime).toBe("19:00");
  });

  it("falls back to the legacy urgentAlerts flag until the member picks", () => {
    expect(resolvePreferences(undefined, false).urgent).toBe(false);
    expect(resolvePreferences({ urgent: true }, false).urgent).toBe(true);
  });

  it("treats a stored null as quiet hours switched off", () => {
    expect(resolvePreferences({ quietHours: null }).quietHours).toBeNull();
  });
});

describe("presets", () => {
  it("recognises each preset and anything else as custom", () => {
    const base = resolvePreferences(undefined);
    for (const id of ["everything", "important", "emergencies"] as const) {
      expect(presetOf(applyPreset(base, id))).toBe(id);
    }
    expect(presetOf({ ...base, headsUps: false })).toBe("custom");
  });

  it("emergencies only keeps urgent on and everything else off", () => {
    expect(PRESETS.emergencies.values).toMatchObject({ urgent: true, headsUps: false, dailySummary: false });
  });

  it("keeps the member's summary time and quiet-hour times when switching", () => {
    const mine = { ...resolvePreferences(undefined), summaryTime: "08:30", quietHours: { start: "21:00", end: "06:00" } };
    const everything = applyPreset(mine, "everything");
    expect(everything.summaryTime).toBe("08:30");
    expect(everything.quietHours).toBeNull();
    expect(applyPreset(everything, "important").quietHours).toEqual(DEFAULT_QUIET_HOURS);
    expect(applyPreset(mine, "important").quietHours).toEqual({ start: "21:00", end: "06:00" });
  });

  it("ignores exact quiet-hour times when naming the preset", () => {
    const shifted = { ...resolvePreferences(undefined), quietHours: { start: "23:00", end: "06:30" } };
    expect(presetOf(shifted)).toBe("important");
    expect(describePreferences(shifted)).toBe("Just the important stuff · quiet 11 PM–6:30 AM");
  });
});

describe("inQuietHours", () => {
  it("wraps past midnight in the patient's time zone", () => {
    expect(inQuietHours(DEFAULT_QUIET_HOURS, TZ, pdt("23:30"))).toBe(true);
    expect(inQuietHours(DEFAULT_QUIET_HOURS, TZ, pdt("03:00"))).toBe(true);
    expect(inQuietHours(DEFAULT_QUIET_HOURS, TZ, pdt("07:00"))).toBe(false);
    expect(inQuietHours(DEFAULT_QUIET_HOURS, TZ, pdt("21:59"))).toBe(false);
    expect(inQuietHours(DEFAULT_QUIET_HOURS, TZ, pdt("22:00"))).toBe(true);
  });

  it("handles same-day windows, and off or empty windows", () => {
    expect(inQuietHours({ start: "13:00", end: "15:00" }, TZ, pdt("14:00"))).toBe(true);
    expect(inQuietHours({ start: "13:00", end: "15:00" }, TZ, pdt("15:00"))).toBe(false);
    expect(inQuietHours(null, TZ, pdt("03:00"))).toBe(false);
    expect(inQuietHours({ start: "09:00", end: "09:00" }, TZ, pdt("09:00"))).toBe(false);
  });
});

describe("validatePreferences", () => {
  it("rejects bad times with readable messages", () => {
    const base = resolvePreferences(undefined);
    expect(() => validatePreferences({ ...base, summaryTime: "7pm" })).toThrow("Summary time must be a time like 19:00");
    expect(() => validatePreferences({ ...base, quietHours: { start: "22:00", end: "22:00" } })).toThrow(
      "different start and end",
    );
    expect(validatePreferences(base)).toBe(base);
  });

  it("formats clock times for people", () => {
    expect(formatClock("19:00")).toBe("7 PM");
    expect(formatClock("07:30")).toBe("7:30 AM");
    expect(formatClock("00:00")).toBe("12 AM");
    expect(formatClock("12:15")).toBe("12:15 PM");
  });
});
