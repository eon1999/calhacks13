// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { backend } from "./setup";

const TZ = "America/Los_Angeles";
const MIN = 60_000;
// 2026-10-24 14:00 PDT
const T = Date.UTC(2026, 9, 24, 21, 0);

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function patientWithDose(t: ReturnType<typeof backend>) {
  return t.run(async (ctx) => {
    const patientId = await ctx.db.insert("patients", { name: "Ruth Park", timeZone: TZ });
    await ctx.db.insert("careTeamMembers", {
      patientId,
      userId: "dan",
      role: "care_partner",
      permissions: ["alerts", "summary"],
      name: "Dan",
      isOwner: true,
    });
    const medicationId = await ctx.db.insert("medications", {
      patientId,
      name: "Acetaminophen",
      doseLabel: "1000 mg",
      times: ["14:00"],
      windowMinutes: 30,
      active: true,
    });
    return { patientId, medicationId };
  });
}

async function at(time: number, fn: () => Promise<unknown>) {
  vi.setSystemTime(time);
  return fn();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T - 3 * 24 * 60 * MIN);
});
afterEach(() => vi.useRealTimers());

describe("dose engine", () => {
  it("reminds at T and T+15, then tells the care partner at T+30", async () => {
    const t = backend();
    const { patientId } = await patientWithDose(t);

    await at(T - 20 * MIN, () => t.mutation(internal.doses.tick, {}));
    const rows = await t.run((ctx) => ctx.db.query("doseEvents").collect());
    expect(rows.map((r) => r.status)).toEqual(["due"]);

    await at(T, () => t.mutation(internal.doses.tick, {}));
    let prompts = await t.query(api.alerts.pendingPrompts, { patientId, now: T });
    expect(prompts.map((p) => p.kind)).toEqual(["dose_reminder"]);
    expect(prompts[0].reason).toContain("Ruth");

    await at(T + 15 * MIN, () => t.mutation(internal.doses.tick, {}));
    prompts = await t.query(api.alerts.pendingPrompts, { patientId, now: T + 15 * MIN });
    expect(prompts).toHaveLength(1);
    expect(prompts[0].reason).toMatch(/^Second reminder/);

    await at(T + 31 * MIN, () => t.mutation(internal.doses.tick, {}));
    const care = await t.query(api.alerts.forCare, { patientId });
    expect(care.open.map((a) => a.kind)).toEqual(["missed_dose"]);
    expect(care.open[0].reason).toContain("hasn't taken the 2:00 PM dose");

    await t.mutation(api.alerts.acknowledge, { alertId: care.open[0]._id, by: "Dan", note: "I called her" });
    const after = await t.query(api.alerts.forCare, { patientId });
    expect(after.open).toEqual([]);
    expect(after.handled[0].acknowledgedBy).toBe("Dan: I called her");

    // A missed dose is only alerted once.
    await at(T + 33 * MIN, () => t.mutation(internal.doses.tick, {}));
    expect((await t.query(api.alerts.forCare, { patientId })).open).toEqual([]);
  });

  it("lid open → opened, voice confirm → taken, second opening → extra-opening warning", async () => {
    const t = backend();
    const { patientId, medicationId } = await patientWithDose(t);

    await at(T, () => t.mutation(internal.doses.tick, {}));
    const result = await at(T + 3 * MIN, () => t.mutation(api.demo.lidOpen, { patientId }));
    expect(result).toEqual({ match: "dose" });
    let dose = await t.run((ctx) => ctx.db.query("doseEvents").first());
    expect(dose).toMatchObject({ status: "opened", source: "pillbox", openedAt: T + 3 * MIN });
    const prompts = await t.query(api.alerts.pendingPrompts, { patientId, now: T + 3 * MIN });
    expect(prompts.map((p) => p.kind)).toEqual(["dose_confirm"]);

    await at(T + 4 * MIN, () => t.mutation(api.voice.confirmDose, { patientId, medicationId, scheduledFor: T }));
    dose = await t.run((ctx) => ctx.db.query("doseEvents").first());
    expect(dose).toMatchObject({ status: "taken", source: "pillbox" });
    expect(await t.query(api.alerts.pendingPrompts, { patientId, now: T + 4 * MIN })).toEqual([]);

    // Not missed later.
    await at(T + 40 * MIN, () => t.mutation(internal.doses.tick, {}));
    expect((await t.query(api.alerts.forCare, { patientId })).open).toEqual([]);

    const extra = await at(T + 40 * MIN, () => t.mutation(api.demo.lidOpen, { patientId }));
    expect(extra).toEqual({ match: "extra" });
    const care = await t.query(api.alerts.forCare, { patientId });
    expect(care.open.map((a) => a.kind)).toEqual(["extra_opening"]);
    expect((await t.query(api.alerts.pendingPrompts, { patientId, now: T + 40 * MIN })).map((p) => p.kind)).toEqual([
      "extra_opening_prompt",
    ]);
  });

  it("the hub marks prompts as spoken", async () => {
    const t = backend();
    const { patientId } = await patientWithDose(t);
    await at(T, () => t.mutation(internal.doses.tick, {}));
    const [prompt] = await t.query(api.alerts.pendingPrompts, { patientId, now: T });
    await t.mutation(api.alerts.markDelivered, { alertId: prompt._id });
    expect(await t.query(api.alerts.pendingPrompts, { patientId, now: T })).toEqual([]);
  });
});

describe("falls and SOS", () => {
  it("no answer in 30 s becomes an urgent alert", async () => {
    const t = backend();
    const { patientId } = await patientWithDose(t);
    vi.setSystemTime(T);
    await t.mutation(api.demo.fall, { patientId });
    expect(await t.query(api.safety.pending, { patientId, now: T + 1000 })).not.toBeNull();
    expect((await t.query(api.alerts.pendingPrompts, { patientId, now: T })).map((p) => p.kind)).toEqual(["fall_check"]);

    vi.advanceTimersByTime(31_000);
    await t.finishInProgressScheduledFunctions();
    const care = await t.query(api.alerts.forCare, { patientId });
    expect(care.open.map((a) => [a.tier, a.kind])).toEqual([["urgent", "fall_unanswered"]]);
    const fall = await t.run((ctx) => ctx.db.query("events").first());
    expect(fall?.resolution).toBe("unresolved");
  });

  it("\"I'm okay\" cancels the alert", async () => {
    const t = backend();
    const { patientId } = await patientWithDose(t);
    vi.setSystemTime(T);
    await t.mutation(api.demo.fall, { patientId });
    vi.setSystemTime(T + 10_000);
    expect(await t.mutation(api.safety.imOkay, { patientId })).toBe(true);
    vi.advanceTimersByTime(31_000);
    await t.finishInProgressScheduledFunctions();
    expect((await t.query(api.alerts.forCare, { patientId })).open).toEqual([]);
    const fall = await t.run((ctx) => ctx.db.query("events").first());
    expect(fall?.resolution).toBe("ok");
  });

  it("a calm voice check-in after a fall also cancels it", async () => {
    const t = backend();
    const { patientId } = await patientWithDose(t);
    vi.setSystemTime(T);
    await t.mutation(api.voice.logDeviceEvent, { patientId, type: "fall" });
    // The hub was already speaking, so no spoken prompt is queued.
    expect(await t.query(api.alerts.pendingPrompts, { patientId, now: T })).toEqual([]);
    await t.mutation(api.voice.recordCheckIn, {
      patientId,
      trigger: "fall",
      transcript: "I'm fine, just sat down hard",
      state: "doing_well",
      redFlag: false,
    });
    vi.advanceTimersByTime(31_000);
    await t.finishInProgressScheduledFunctions();
    expect((await t.query(api.alerts.forCare, { patientId })).open).toEqual([]);
  });

  it("SOS alerts urgently once, even when the agent alerts too", async () => {
    const t = backend();
    const { patientId } = await patientWithDose(t);
    vi.setSystemTime(T);
    await t.mutation(api.demo.sos, { patientId });
    await t.mutation(api.voice.createAlert, { patientId, tier: "urgent", reason: "Pressed SOS, says she can't get up" });
    const care = await t.query(api.alerts.forCare, { patientId });
    expect(care.open).toHaveLength(1);
    expect(care.open[0].reason).toContain("can't get up");
  });
});

describe("check-ins", () => {
  it("two 'struggling' check-ins in a row notify the care team", async () => {
    const t = backend();
    const { patientId } = await patientWithDose(t);
    vi.setSystemTime(T);
    await t.mutation(api.demo.checkIn, { patientId, state: "struggling", painScore: 7 });
    expect((await t.query(api.alerts.forCare, { patientId })).open).toEqual([]);
    await t.mutation(api.demo.checkIn, { patientId, state: "struggling", painScore: 8 });
    expect((await t.query(api.alerts.forCare, { patientId })).open.map((a) => a.kind)).toEqual(["struggling_twice"]);
  });
});

describe("device HTTP routes", () => {
  it("authenticates by token hash, logs events, and returns LED commands", async () => {
    const t = backend();
    const { patientId } = await patientWithDose(t);
    await t.run((ctx) => ctx.db.patch(patientId, { ownerUserId: "dan" }));
    await t.mutation(api.devices.register, {
      userId: "dan",
      patientId,
      kind: "med_station",
      deviceId: "box-01",
      tokenHash: await sha256Hex("s3cret"),
    });

    vi.setSystemTime(T);
    await t.mutation(internal.doses.tick, {});
    const post = (path: string, body: unknown, token = "s3cret") =>
      t.fetch(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    expect((await post("/device/heartbeat", { deviceId: "box-01" }, "wrong")).status).toBe(401);
    expect((await post("/device/heartbeat", { deviceId: "band-99" })).status).toBe(403);

    const beat = await post("/device/heartbeat", { deviceId: "box-01", firmwareVersion: "0.1.0" });
    expect(beat.status).toBe(200);
    expect(await beat.json()).toEqual({ led: "due", buzz: false });

    const lid = await post("/device/event", { deviceId: "box-01", type: "lid_open" });
    expect(await lid.json()).toEqual({ ok: true, match: "dose" });

    const bad = await post("/device/event", { deviceId: "box-01", type: "explode" });
    expect(bad.status).toBe(400);

    const activity = await post("/device/activity", { deviceId: "box-01", steps: 120, activeMinutes: 2, heartRate: 81 });
    expect(activity.status).toBe(200);
    const samples = await t.run((ctx) => ctx.db.query("activitySamples").collect());
    expect(samples).toHaveLength(1);
  });

  it("raises one device-offline alert after 15 silent minutes, cleared on return", async () => {
    const t = backend();
    const { patientId } = await patientWithDose(t);
    vi.setSystemTime(T);
    await t.mutation(api.demo.deviceOffline, { patientId });
    await t.mutation(internal.doses.tick, {});
    let care = await t.query(api.alerts.forCare, { patientId });
    expect(care.open.map((a) => a.kind)).toEqual(["device_offline"]);
    await t.mutation(api.demo.deviceBack, { patientId });
    care = await t.query(api.alerts.forCare, { patientId });
    expect(care.open).toEqual([]);
  });
});

describe("demo seed, reports and summaries", () => {
  it("seeds two weeks of labeled history and reports patterns with evidence", async () => {
    vi.useRealTimers();
    const t = backend();
    const patientId: Id<"patients"> = await t.mutation(api.seed.seedDemo, {});
    const now = Date.now();
    const report = await t.query(api.reports.clinician, { patientId, from: now - 14 * 24 * 60 * MIN, to: now });
    expect(report?.patient.isDemo).toBe(true);
    expect(report!.stats.adherence.scheduled).toBeGreaterThan(50);
    expect(report!.stats.patterns.map((p) => p.id)).toEqual(expect.arrayContaining(["pain_after_dose", "missed_time_of_day"]));

    const care = await t.query(api.reports.care, { patientId, now });
    expect(care?.week.rate).not.toBeNull();
    expect(care?.patient.recovery?.day).toBe(16);

    // No ANTHROPIC_API_KEY in tests: the template is used, and labeled as such.
    expect(await t.action(api.ai.generateClinicianReport, { patientId, from: now - 14 * 24 * 60 * MIN, to: now })).toEqual({
      model: "template",
    });
    const saved = await t.query(api.reports.clinician, { patientId, from: now - 14 * 24 * 60 * MIN, to: now });
    expect(saved?.report?.sections.sections).toHaveLength(5);

    expect(await t.action(api.ai.requestDailySummary, { patientId })).toEqual({ model: "template" });
    const withSummary = await t.query(api.reports.care, { patientId, now: Date.now() });
    expect(withSummary?.summary?.body).toContain("Margaret");
  });

  it("resetDemo rebuilds only demo patients", async () => {
    vi.useRealTimers();
    const t = backend();
    const real = await t.run((ctx) => ctx.db.insert("patients", { name: "Real Person", timeZone: TZ }));
    await t.mutation(api.demo.resetDemo, {});
    const second = await t.mutation(api.demo.resetDemo, {});
    const patients = await t.run((ctx) => ctx.db.query("patients").collect());
    expect(patients.map((p) => p._id).sort()).toEqual([real, second].sort());
  });
});
