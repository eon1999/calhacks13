// Stands in for the ESP32 wristband: posts to the same /device/* routes with a
// real device token, so the auth and parsing the firmware will hit get used.
//
//   npm run fake-band                         stream windows + heartbeats until Ctrl-C
//   npm run fake-band -- --speed 30           5-minute windows every 10 s
//   npm run fake-band -- --scenario inactive  zero-movement windows (inactivity)
//   npm run fake-band -- --fall-after 1m      also fall once, a minute in
//   npm run fake-band -- fall | sos | lid     send one event and exit
//
// Needs FAKE_BAND_ID and FAKE_BAND_TOKEN (register a device on /settings).
// The URL comes from .env.local; FAKE_BAND_URL overrides it.

import { parseArgs } from "node:util";
import { activityWindow, fallPeakG, parseDuration, SCENARIOS, type Scenario } from "../lib/fake-band.ts";

const FIRMWARE_VERSION = "fake-band-0.1";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the shell's environment.
}

function siteUrl(): string {
  const explicit = process.env.FAKE_BAND_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const cloud = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (cloud?.endsWith(".convex.cloud")) return cloud.replace(/\.cloud$/, ".site");
  throw new Error("No Convex site URL: set NEXT_PUBLIC_CONVEX_SITE_URL in .env.local or FAKE_BAND_URL");
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. Register a device on /settings and export its id and token.`);
  return value;
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    scenario: { type: "string", default: "normal" },
    window: { type: "string", default: "5m" },
    speed: { type: "string", default: "1" },
    heartbeat: { type: "string", default: "30s" },
    "fall-after": { type: "string" },
  },
});

const deviceId = required("FAKE_BAND_ID");
const token = required("FAKE_BAND_TOKEN");
const base = siteUrl();

class FatalDeviceError extends Error {}

async function post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, ...body }),
  });
  const reply = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 || res.status === 403) throw new FatalDeviceError(`${path} → ${res.status}: ${reply.error ?? "rejected"}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${reply.error ?? res.statusText}`);
  return reply;
}

function log(message: string) {
  console.log(`${new Date().toLocaleTimeString()}  ${message}`);
}

async function send(label: string, task: () => Promise<string>) {
  try {
    log(`${label}  ${await task()}`);
  } catch (error) {
    if (error instanceof FatalDeviceError) {
      console.error(`${error.message}\nCheck FAKE_BAND_ID / FAKE_BAND_TOKEN against /settings.`);
      process.exit(1);
    }
    log(`${label}  failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const sendFall = () =>
  send("fall", async () => {
    const peakG = fallPeakG();
    await post("/device/event", { type: "fall", peakG });
    return `peak ${peakG} g`;
  });

const oneShot: Record<string, () => Promise<void>> = {
  fall: sendFall,
  sos: () => send("sos", async () => (await post("/device/event", { type: "sos" }), "sent")),
  lid: () => send("lid", async () => JSON.stringify((await post("/device/event", { type: "lid_open" })).match ?? null)),
};

async function stream() {
  const scenario = values.scenario as Scenario;
  if (!SCENARIOS.includes(scenario)) throw new Error(`--scenario must be one of ${SCENARIOS.join(", ")}`);
  const speed = Number(values.speed);
  if (!(speed > 0)) throw new Error("--speed must be a positive number");
  const windowMs = parseDuration(values.window);
  const windowMinutes = windowMs / 60_000;
  if (windowMinutes < 1) throw new Error("--window must be at least 1m");

  log(`fake band ${deviceId} → ${base}  (${scenario}, ${values.window} windows every ${windowMs / speed / 1000}s)`);

  let lastCommand = "";
  const heartbeat = () =>
    send("heartbeat", async () => {
      const reply = await post("/device/heartbeat", { firmwareVersion: FIRMWARE_VERSION });
      const command = `led=${reply.led} buzz=${reply.buzz}`;
      const changed = command !== lastCommand;
      lastCommand = command;
      return changed ? command : `${command} (same)`;
    });
  const activity = () =>
    send("activity ", async () => {
      const w = activityWindow(deviceId, scenario, windowMinutes);
      await post("/device/activity", { steps: w.steps, activeMinutes: w.activeMinutes, heartRate: w.heartRate });
      return `${w.steps} steps, ${w.activeMinutes} active min, ${w.heartRate ?? "no"} bpm`;
    });

  await heartbeat();
  await activity();
  setInterval(heartbeat, parseDuration(values.heartbeat));
  setInterval(activity, windowMs / speed);
  if (values["fall-after"]) setTimeout(sendFall, parseDuration(values["fall-after"]));
}

const command = positionals[0];
try {
  if (!command) await stream();
  else if (oneShot[command]) await oneShot[command]();
  else throw new Error(`Unknown command "${command}" (fall, sos or lid)`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
