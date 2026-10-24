import { describe, expect, it } from "vitest";
import { localDateKey, procedureLabel, recoveryStatus } from "./recovery";

describe("localDateKey", () => {
  it("formats the calendar date in the patient's time zone", () => {
    // 2026-10-23 03:00 UTC is still Oct 22 in Los Angeles.
    const now = Date.UTC(2026, 9, 23, 3, 0);
    expect(localDateKey("America/Los_Angeles", now)).toBe("2026-10-22");
    expect(localDateKey("UTC", now)).toBe("2026-10-23");
  });
});

describe("recoveryStatus", () => {
  it("counts surgery day as day 0", () => {
    expect(recoveryStatus("2026-10-20", "2026-10-20")).toMatchObject({ day: 0, phase: "first_days" });
  });

  it("moves through phases as days pass", () => {
    expect(recoveryStatus("2026-10-01", "2026-10-04").phase).toBe("first_days");
    expect(recoveryStatus("2026-10-01", "2026-10-05").phase).toBe("early");
    expect(recoveryStatus("2026-10-01", "2026-10-16").phase).toBe("strengthening");
    expect(recoveryStatus("2026-10-01", "2026-11-13").phase).toBe("routine");
  });

  it("handles a surgery that is still upcoming", () => {
    expect(recoveryStatus("2026-10-25", "2026-10-23")).toMatchObject({ day: -2, phase: "pre_op" });
  });

  it("is not thrown off by daylight saving changes", () => {
    // US clocks fall back on 2026-11-01.
    expect(recoveryStatus("2026-10-31", "2026-11-02").day).toBe(2);
  });

  it("returns a readable label", () => {
    expect(recoveryStatus("2026-10-20", "2026-10-23").label).toBe("Day 3 after surgery · First days home");
  });
});

describe("procedureLabel", () => {
  it("uses the free-text name for other procedures", () => {
    expect(procedureLabel("other", "Shoulder repair")).toBe("Shoulder repair");
    expect(procedureLabel("knee_replacement")).toBe("Knee replacement");
  });
});
