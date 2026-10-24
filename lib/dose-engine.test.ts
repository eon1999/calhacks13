import { describe, expect, it } from "vitest";
import {
  engineSlots,
  isLowActivity,
  ledState,
  matchLidOpen,
  planTick,
  type EngineDose,
  type EngineMedication,
} from "./dose-engine";
import { localTimeToday } from "./schedule";

const TZ = "America/Los_Angeles";
const MIN = 60_000;
// 2026-10-24 14:00 PDT
const T = Date.UTC(2026, 9, 24, 21, 0);

const med = (over: Partial<EngineMedication> = {}): EngineMedication => ({
  id: "med_a",
  name: "Acetaminophen",
  doseLabel: "1000 mg",
  times: ["14:00"],
  windowMinutes: 30,
  createdAt: T - 3 * 24 * 60 * MIN,
  ...over,
});

const dose = (over: Partial<EngineDose>): EngineDose => ({
  id: "dose_1",
  medicationId: "med_a",
  scheduledFor: T,
  status: "due",
  ...over,
});

function plan(now: number, doses: EngineDose[] = [], meds = [med()]) {
  return planTick(engineSlots(meds, doses, TZ, now), now);
}

describe("engineSlots", () => {
  it("covers yesterday and today", () => {
    const slots = engineSlots([med()], [], TZ, T);
    expect(slots.map((s) => s.scheduledFor)).toEqual([T - 24 * 60 * MIN, T]);
    expect(localTimeToday(TZ, "14:00", T)).toBe(T);
  });

  it("marks doses scheduled before the medicine was added as ineligible", () => {
    const slots = engineSlots([med({ createdAt: T + 5 * MIN })], [], TZ, T + 10 * MIN);
    expect(slots.every((s) => !s.eligible)).toBe(true);
  });
});

describe("planTick", () => {
  it("creates the dose row when the window opens, without reminding yet", () => {
    const p = plan(T - 20 * MIN);
    expect(p.create.map((s) => s.scheduledFor)).toEqual([T]);
    expect(p.reminders).toEqual([]);
  });

  it("does nothing before the window", () => {
    const p = plan(T - 45 * MIN);
    expect(p.create).toEqual([]);
  });

  it("reminds at T, then again at T+15", () => {
    expect(plan(T, [dose({})]).reminders.map((r) => r.n)).toEqual([1]);
    expect(plan(T + 5 * MIN, [dose({ remindersSent: 1 })]).reminders).toEqual([]);
    expect(plan(T + 15 * MIN, [dose({ remindersSent: 1 })]).reminders.map((r) => r.n)).toEqual([2]);
    expect(plan(T + 16 * MIN, [dose({ remindersSent: 2 })]).reminders).toEqual([]);
  });

  it("groups doses at the same time into one reminder", () => {
    const meds = [med(), med({ id: "med_b", name: "Cephalexin" })];
    const p = plan(T, [], meds);
    expect(p.reminders).toHaveLength(1);
    expect(p.reminders[0].slots.map((s) => s.name)).toEqual(["Acetaminophen", "Cephalexin"]);
  });

  it("marks a dose missed after the window and alerts once", () => {
    const fresh = plan(T + 31 * MIN, [dose({ remindersSent: 2 })]);
    expect(fresh.missed).toHaveLength(1);
    expect(fresh.missedAlerts).toHaveLength(1);

    const stale = plan(T + 60 * MIN, [dose({ remindersSent: 2 })]);
    expect(stale.missed).toHaveLength(1);
    expect(stale.missedAlerts).toHaveLength(0);
  });

  it("leaves opened and taken doses alone", () => {
    expect(plan(T + 40 * MIN, [dose({ status: "opened", openedAt: T + 3 * MIN })]).missed).toEqual([]);
    expect(plan(T + 40 * MIN, [dose({ status: "taken", confirmedAt: T + 3 * MIN })]).missed).toEqual([]);
  });

  it("skips stale reminders instead of firing them late", () => {
    expect(plan(T + 12 * MIN, [dose({})]).reminders).toEqual([]);
  });

  it("ignores a medicine added after the dose time", () => {
    const p = plan(T + 40 * MIN, [], [med({ createdAt: T + 35 * MIN })]);
    expect(p.create).toEqual([]);
    expect(p.missed).toEqual([]);
  });
});

describe("matchLidOpen", () => {
  it("matches the due dose", () => {
    const m = matchLidOpen(engineSlots([med()], [dose({})], TZ, T + 3 * MIN), T + 3 * MIN);
    expect(m).toMatchObject({ kind: "dose", scheduledFor: T, late: false });
  });

  it("counts a late opening up to 90 minutes", () => {
    const m = matchLidOpen(engineSlots([med()], [dose({ status: "missed" })], TZ, T + 60 * MIN), T + 60 * MIN);
    expect(m).toMatchObject({ kind: "dose", late: true });
  });

  it("flags an extra opening within 2 hours of a taken dose", () => {
    const doses = [dose({ status: "taken", confirmedAt: T + 3 * MIN })];
    const at = T + 40 * MIN;
    const m = matchLidOpen(engineSlots([med()], doses, TZ, at), at);
    expect(m).toMatchObject({ kind: "extra", lastTakenAt: T + 3 * MIN });
  });

  it("is nothing outside every window", () => {
    const at = T + 5 * 60 * MIN;
    expect(matchLidOpen(engineSlots([med()], [], TZ, at), at)).toEqual({ kind: "none" });
  });
});

describe("ledState", () => {
  it("is blue while due, green after taking, red after a miss, then off", () => {
    expect(ledState(engineSlots([med()], [dose({})], TZ, T), T)).toBe("due");
    const taken = [dose({ status: "taken", confirmedAt: T + 2 * MIN })];
    expect(ledState(engineSlots([med()], taken, TZ, T + 10 * MIN), T + 10 * MIN)).toBe("taken");
    const missed = [dose({ status: "missed" })];
    expect(ledState(engineSlots([med()], missed, TZ, T + 40 * MIN), T + 40 * MIN)).toBe("missed");
    expect(ledState(engineSlots([med()], missed, TZ, T + 4 * 60 * MIN), T + 4 * 60 * MIN)).toBe("off");
  });
});

describe("isLowActivity", () => {
  const now = T;
  const still = Array.from({ length: 37 }, (_, i) => ({ windowStart: now - i * 5 * MIN, steps: 0 }));

  it("fires after three still hours while awake", () => {
    expect(isLowActivity(still, now, 14)).toBe(true);
  });

  it("not at night, not with any steps, not without enough history", () => {
    expect(isLowActivity(still, now, 22)).toBe(false);
    expect(isLowActivity([...still, { windowStart: now - 30 * MIN, steps: 40 }], now, 14)).toBe(false);
    expect(isLowActivity(still.slice(0, 10), now, 14)).toBe(false);
  });
});
