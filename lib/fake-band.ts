// A fake wristband for building without hardware. It makes the same summaries
// the ESP32 will post to convex/http.ts (README "Device API"): the band counts
// steps and works out BPM on-device, and sends one small window at a time.
// scripts/fake-band.ts posts these over HTTP with a real device token.

export const SCENARIOS = ["normal", "resting", "inactive"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export interface ActivityWindow {
  deviceId: string;
  steps: number;
  activeMinutes: number;
  heartRate?: number;
}

/** Returns a number in [0, 1). Injected so tests are deterministic. */
export type Random = () => number;

const STEPS_PER_ACTIVE_MINUTE = [80, 110] as const;
const RESTING_BPM = [62, 78] as const;
const MAX_EXERTION_BPM = 28;
// How often the PPG sensor has no usable reading (loose strap, off skin).
const NO_PULSE_CHANCE = 0.1;
const FALL_PEAK_G = [2.5, 4.5] as const;

function between(random: Random, [lo, hi]: readonly [number, number]): number {
  return lo + random() * (hi - lo);
}

function heartRate(random: Random, exertion: number): number | undefined {
  if (random() < NO_PULSE_CHANCE) return undefined;
  return Math.round(between(random, RESTING_BPM) + exertion * MAX_EXERTION_BPM);
}

/**
 * One window of `minutes` minutes. Counts are for this window only, not running
 * totals: reports add windows up per day.
 */
export function activityWindow(deviceId: string, scenario: Scenario, minutes: number, random: Random = Math.random): ActivityWindow {
  if (scenario === "inactive") {
    return { deviceId, steps: 0, activeMinutes: 0, heartRate: heartRate(random, 0) };
  }
  const walking = scenario === "normal" && random() < 0.5;
  const activeMinutes = walking ? Math.max(1, Math.round(minutes * between(random, [0.3, 1]))) : 0;
  const idleSteps = Math.round(random() * 6 * minutes);
  const steps = Math.round(activeMinutes * between(random, STEPS_PER_ACTIVE_MINUTE)) + idleSteps;
  return { deviceId, steps, activeMinutes, heartRate: heartRate(random, activeMinutes / minutes) };
}

/** Peak acceleration of a simulated fall, in g. */
export function fallPeakG(random: Random = Math.random): number {
  return Math.round(between(random, FALL_PEAK_G) * 10) / 10;
}

/** "30s", "5m", "1h" or a bare number of seconds → milliseconds. */
export function parseDuration(text: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(text.trim());
  if (!match) throw new Error(`Can't read duration "${text}" (try 30s, 5m or 1h)`);
  const unit = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 }[match[2] ?? "s"];
  return Number(match[1]) * unit!;
}
