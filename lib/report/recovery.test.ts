import { describe, expect, it } from "vitest";
import { localTimeToday } from "../schedule";
import { adherenceByDay, adherencePercent, localMidnight, reportDays, shortDate } from "./recovery";

const TZ = "America/Los_Angeles";
const now = Date.parse("2026-10-24T15:00:00-07:00");

describe("reportDays", () => {
  it("lists local days oldest first, ending today", () => {
    const days = reportDays(TZ, now, 3);
    expect(days.map((d) => d.date)).toEqual(["2026-10-22", "2026-10-23", "2026-10-24"]);
    expect(days[2].start).toBe(Date.parse("2026-10-24T00:00:00-07:00"));
  });

  it("finds local midnight for a date", () => {
    expect(localMidnight(TZ, "2026-10-22")).toBe(Date.parse("2026-10-22T00:00:00-07:00"));
    expect(shortDate("2026-10-22")).toBe("Oct 22");
  });
});

describe("adherenceByDay", () => {
  const med = {
    id: "apix",
    name: "Apixaban",
    doseLabel: "2.5 mg",
    times: ["08:00", "20:00"],
    windowMinutes: 60,
    countFrom: localMidnight(TZ, "2026-10-23"),
  };
  const yesterday8 = localTimeToday(TZ, "08:00", now - 86_400_000);
  const today8 = localTimeToday(TZ, "08:00", now);

  it("counts closed doses from the discharge day, and leaves today's later doses out", () => {
    const events = [
      { medicationId: "apix", scheduledFor: yesterday8, status: "taken" },
      { medicationId: "apix", scheduledFor: today8, status: "taken" },
    ];
    const result = adherenceByDay([med], events, TZ, reportDays(TZ, now, 3), now);
    expect(result).toEqual([
      { date: "2026-10-22", taken: 0, counted: 0, missed: [] },
      { date: "2026-10-23", taken: 1, counted: 2, missed: [{ name: "Apixaban", time: "20:00" }] },
      { date: "2026-10-24", taken: 1, counted: 1, missed: [] },
    ]);
    expect(adherencePercent(result)).toBe(67);
  });

  it("has no percentage before anything was due", () => {
    expect(adherencePercent([{ date: "2026-10-24", taken: 0, counted: 0, missed: [] }])).toBeNull();
  });
});
