import { describe, expect, it } from "vitest";
import { checkInsForDay, recoveryStatus } from "../onboarding/recovery";
import { dueScheduledCheckIn, scheduledCheckInTimes, type DoseTime } from "./events";

const TZ = "America/Los_Angeles";
const pdt = (hhmm: string) => Date.parse(`2026-10-24T${hhmm}:00-07:00`);
const doses: DoseTime[] = ["08:00", "14:00", "20:00"].map((time) => ({ time, windowMinutes: 60 }));

describe("checkInsForDay", () => {
  it("follows the recovery phase", () => {
    expect(checkInsForDay(recoveryStatus("2026-10-21", "2026-10-24"))).toBe(3); // first days
    expect(checkInsForDay(recoveryStatus("2026-10-14", "2026-10-24"))).toBe(2); // early
    expect(checkInsForDay(recoveryStatus("2026-09-24", "2026-10-24"))).toBe(1); // getting stronger
    expect(checkInsForDay(recoveryStatus("2026-10-30", "2026-10-24"))).toBe(0); // before surgery
  });

  it("checks in every other day once back to routine", () => {
    expect(checkInsForDay({ phase: "routine", day: 50 })).toBe(1);
    expect(checkInsForDay({ phase: "routine", day: 51 })).toBe(0);
  });
});

describe("scheduledCheckInTimes", () => {
  it("spreads check-ins across waking hours", () => {
    expect(scheduledCheckInTimes(3, [])).toEqual(["11:00", "15:00", "19:00"]);
    expect(scheduledCheckInTimes(2, [])).toEqual(["12:00", "18:00"]);
    expect(scheduledCheckInTimes(1, [])).toEqual(["15:00"]);
    expect(scheduledCheckInTimes(0, [])).toEqual([]);
  });

  it("moves out of every dose's reminder window", () => {
    expect(scheduledCheckInTimes(3, doses)).toEqual(["11:00", "15:15", "18:45"]);
    for (const t of scheduledCheckInTimes(3, doses)) {
      const [h, m] = t.split(":").map(Number);
      for (const d of doses) {
        const [dh, dm] = d.time.split(":").map(Number);
        expect(Math.abs(h * 60 + m - (dh * 60 + dm))).toBeGreaterThan(d.windowMinutes);
      }
    }
  });

  it("stays inside waking hours", () => {
    const busy = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"].map((time) => ({
      time,
      windowMinutes: 20,
    }));
    for (const t of scheduledCheckInTimes(3, busy)) expect(t >= "09:00" && t < "21:00").toBe(true);
  });
});

describe("dueScheduledCheckIn", () => {
  const recovery = { phase: "first_days" as const, day: 3 };
  const due = (now: number, checkInTimes: number[] = []) =>
    dueScheduledCheckIn({ recovery, doses, checkInTimes, timeZone: TZ, now });

  it("is due from the slot time until the next slot", () => {
    expect(due(pdt("10:59"))).toBeNull();
    expect(due(pdt("11:00"))).toEqual({ time: "11:00", scheduledFor: pdt("11:00"), key: `check_in@${pdt("11:00")}` });
    expect(due(pdt("15:14"))?.time).toBe("11:00");
    expect(due(pdt("15:15"))?.time).toBe("15:15");
    expect(due(pdt("20:59"))?.time).toBe("18:45");
    expect(due(pdt("21:00"))).toBeNull();
  });

  it("skips a slot that already had a check-in, including one just before it", () => {
    expect(due(pdt("12:00"), [pdt("11:20")])).toBeNull();
    expect(due(pdt("12:00"), [pdt("10:15")])).toBeNull();
    expect(due(pdt("12:00"), [pdt("09:30")])?.time).toBe("11:00");
  });

  it("has nothing without a recovery profile or on a day off", () => {
    expect(dueScheduledCheckIn({ recovery: null, doses, checkInTimes: [], timeZone: TZ, now: pdt("12:00") })).toBeNull();
    expect(
      dueScheduledCheckIn({ recovery: { phase: "routine", day: 51 }, doses, checkInTimes: [], timeZone: TZ, now: pdt("16:00") }),
    ).toBeNull();
  });
});
