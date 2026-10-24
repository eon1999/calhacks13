import { describe, expect, it } from "vitest";
import { activityWindow, fallPeakG, parseDuration, SCENARIOS, type Random } from "./fake-band";
import { activityPayload, devicePayload } from "./schemas";

// mulberry32: a tiny seeded PRNG so runs are repeatable.
function seeded(seed: number): Random {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("activityWindow", () => {
  it("always matches the device API schema", () => {
    const random = seeded(1);
    for (const scenario of SCENARIOS) {
      for (let i = 0; i < 500; i++) {
        const w = activityWindow("band-1", scenario, 5, random);
        expect(activityPayload.safeParse(w).success).toBe(true);
        expect(w.activeMinutes).toBeLessThanOrEqual(5);
      }
    }
  });

  it("reports no movement when inactive", () => {
    const random = seeded(2);
    for (let i = 0; i < 50; i++) {
      expect(activityWindow("band-1", "inactive", 10, random)).toMatchObject({ steps: 0, activeMinutes: 0 });
    }
  });

  it("walks some of the time in the normal scenario, never when resting", () => {
    const random = seeded(3);
    const normal = Array.from({ length: 200 }, () => activityWindow("band-1", "normal", 5, random));
    const resting = Array.from({ length: 200 }, () => activityWindow("band-1", "resting", 5, random));
    expect(normal.some((w) => w.activeMinutes > 0)).toBe(true);
    expect(normal.some((w) => w.activeMinutes === 0)).toBe(true);
    expect(resting.every((w) => w.activeMinutes === 0)).toBe(true);
  });

  it("sometimes has no pulse reading, like a loose strap", () => {
    const random = seeded(4);
    const windows = Array.from({ length: 200 }, () => activityWindow("band-1", "resting", 5, random));
    expect(windows.some((w) => w.heartRate === undefined)).toBe(true);
    expect(windows.some((w) => w.heartRate !== undefined)).toBe(true);
  });
});

describe("fallPeakG", () => {
  it("makes a valid fall event", () => {
    const peakG = fallPeakG(seeded(5));
    expect(peakG).toBeGreaterThanOrEqual(2.5);
    expect(devicePayload.safeParse({ deviceId: "band-1", type: "fall", peakG }).success).toBe(true);
  });
});

describe("parseDuration", () => {
  it("reads common units", () => {
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("5m")).toBe(300_000);
    expect(parseDuration("1h")).toBe(3_600_000);
    expect(parseDuration("250ms")).toBe(250);
    expect(parseDuration("12")).toBe(12_000);
  });

  it("rejects nonsense", () => {
    expect(() => parseDuration("soon")).toThrow(/duration/);
  });
});
