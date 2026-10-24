import { describe, expect, it } from "vitest";
import {
  buildDaySchedule,
  localDayBounds,
  localTimeToday,
  makeSlotId,
  parseHhMm,
  parseSlotId,
} from "./schedule";

const TZ = "America/Los_Angeles";
// 2026-10-23 10:00 PDT (UTC-7) = 17:00 UTC
const NOW = Date.UTC(2026, 9, 23, 17, 0);

describe("localTimeToday", () => {
  it("converts a local HH:mm to UTC on the patient's day", () => {
    expect(localTimeToday(TZ, "08:00", NOW)).toBe(Date.UTC(2026, 9, 23, 15, 0));
  });

  it("uses the patient's calendar day, not UTC's", () => {
    // 2026-10-24 02:00 UTC is still 10-23 19:00 in LA
    const lateUtc = Date.UTC(2026, 9, 24, 2, 0);
    expect(localTimeToday(TZ, "08:00", lateUtc)).toBe(Date.UTC(2026, 9, 23, 15, 0));
  });

  it("handles UTC", () => {
    expect(localTimeToday("UTC", "12:30", NOW)).toBe(Date.UTC(2026, 9, 23, 12, 30));
  });
});

describe("parseHhMm", () => {
  it("rejects malformed times", () => {
    expect(() => parseHhMm("8:00")).toThrow();
    expect(() => parseHhMm("24:00")).toThrow();
  });
});

describe("slot ids", () => {
  it("round-trips", () => {
    expect(parseSlotId(makeSlotId("abc123", 42))).toEqual({
      medicationId: "abc123",
      scheduledFor: 42,
    });
  });

  it("rejects garbage", () => {
    expect(parseSlotId("nope")).toBeNull();
    expect(parseSlotId("abc@xyz")).toBeNull();
  });
});

describe("buildDaySchedule", () => {
  const med = {
    id: "med1",
    name: "Carbidopa/Levodopa",
    doseLabel: "25/100 mg",
    times: ["12:00", "08:00", "10:15"],
    windowMinutes: 30,
  };

  it("classifies slots as missed, due, upcoming and sorts them", () => {
    const slots = buildDaySchedule([med], [], TZ, NOW);
    expect(slots.map((s) => [s.time, s.status])).toEqual([
      ["08:00", "missed"],
      ["10:15", "due"],
      ["12:00", "upcoming"],
    ]);
  });

  it("marks a slot taken when a matching taken event exists", () => {
    const scheduledFor = localTimeToday(TZ, "08:00", NOW);
    const slots = buildDaySchedule(
      [med],
      [{ medicationId: "med1", scheduledFor, status: "taken" }],
      TZ,
      NOW,
    );
    expect(slots[0].status).toBe("taken");
  });

  it("ignores events for other medications", () => {
    const scheduledFor = localTimeToday(TZ, "08:00", NOW);
    const slots = buildDaySchedule(
      [med],
      [{ medicationId: "other", scheduledFor, status: "taken" }],
      TZ,
      NOW,
    );
    expect(slots[0].status).toBe("missed");
  });
});

describe("localDayBounds", () => {
  it("spans the patient's local midnight to midnight", () => {
    const { start, end } = localDayBounds(TZ, NOW);
    expect(start).toBe(Date.UTC(2026, 9, 23, 7, 0));
    expect(end - start).toBe(24 * 60 * 60 * 1000);
  });
});
