import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { backdateDevice, recordActivity, touchDevice } from "./devices";
import { checkDevices, lidOpened, tickPatient } from "./doses";
import { reportFall, reportSos } from "./safety";
import { createDemoPatient, DEMO_OWNER } from "./seed";
import { saveCheckIn } from "./voice";
import { formatLocalTime } from "../lib/schedule";

// /demo: simulate every device event through the same code paths the device
// routes (convex/http.ts) use, so the demo survives a hardware failure.
// TODO(auth): team-only page; these are public. Remove or gate before real use.

const MINUTE = 60_000;
const DEMO_BAND = "band-demo";

async function patientOrThrow(ctx: MutationCtx, patientId: Id<"patients">): Promise<Doc<"patients">> {
  const patient = await ctx.db.get(patientId);
  if (!patient) throw new Error("Patient not found");
  return patient;
}

function hhmm(timeZone: string, at: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(at),
  );
}

async function demoBand(ctx: MutationCtx, patientId: Id<"patients">): Promise<Doc<"devices">> {
  const existing = await ctx.db
    .query("devices")
    .withIndex("by_deviceId", (q) => q.eq("deviceId", `${DEMO_BAND}-${patientId}`))
    .first();
  if (existing) return existing;
  const tokenHash = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const id = await ctx.db.insert("devices", {
    patientId,
    kind: "wristband",
    deviceId: `${DEMO_BAND}-${patientId}`,
    tokenHash,
    label: "Simulated band (demo)",
    lastSeenAt: Date.now(),
    firmwareVersion: "simulated",
  });
  return (await ctx.db.get(id))!;
}

export const lidOpen = mutation({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => ({ match: await lidOpened(ctx, patientId, { deviceId: "box-demo" }) }),
});

export const fall = mutation({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await patientOrThrow(ctx, patientId);
    await reportFall(ctx, patientId, { payload: { peakG: 3.4, deviceId: DEMO_BAND, simulated: true }, prompt: true });
  },
});

export const sos = mutation({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await reportSos(ctx, patientId, { payload: { deviceId: DEMO_BAND, simulated: true }, prompt: true });
  },
});

/** A dose due right now: adds a demo medicine at the current minute and runs the engine. */
export const doseDueNow = mutation({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const patient = await patientOrThrow(ctx, patientId);
    const now = Date.now();
    await ctx.db.insert("medications", {
      patientId,
      name: "Vitamin D (demo)",
      doseLabel: "1 tablet",
      times: [hhmm(patient.timeZone, now)],
      windowMinutes: 30,
      active: true,
    });
    return tickPatient(ctx, patient, now);
  },
});

/** A dose whose window just closed after two reminders: the care partner gets the alert. */
export const missedDose = mutation({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const patient = await patientOrThrow(ctx, patientId);
    const now = Date.now();
    const time = hhmm(patient.timeZone, now - 31 * MINUTE);
    const medicationId = await ctx.db.insert("medications", {
      patientId,
      name: "Iron (demo)",
      doseLabel: "1 tablet",
      times: [time],
      windowMinutes: 30,
      active: true,
    });
    // Back-date the row so the engine sees an unanswered dose whose window has closed.
    const scheduledFor = Math.floor((now - 31 * MINUTE) / MINUTE) * MINUTE;
    await ctx.db.insert("doseEvents", {
      patientId,
      medicationId,
      scheduledFor,
      status: "due",
      remindersSent: 2,
      lastRemindedAt: scheduledFor + 15 * MINUTE,
    });
    const result = await tickPatient(ctx, patient, now);
    // Done with it: keep it off future schedules.
    await ctx.db.patch(medicationId, { active: false });
    return { ...result, time: formatLocalTime(patient.timeZone, scheduledFor) };
  },
});

/** Wristband activity: a short walk, or three still hours (which triggers a nudge to move). */
export const activity = mutation({
  args: { patientId: v.id("patients"), pattern: v.union(v.literal("walk"), v.literal("still")) },
  handler: async (ctx, { patientId, pattern }) => {
    const patient = await patientOrThrow(ctx, patientId);
    const band = await demoBand(ctx, patientId);
    await touchDevice(ctx, band, "simulated");
    const now = Date.now();
    if (pattern === "walk") {
      await recordActivity(ctx, patientId, { deviceId: band.deviceId, steps: 420, activeMinutes: 6, heartRate: 92 }, now);
      return { lowActivity: false };
    }
    // Replace the last three hours with still windows (demo patient data only).
    const recent = await ctx.db
      .query("activitySamples")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("windowStart", now - 3 * 60 * MINUTE - 15 * MINUTE))
      .collect();
    for (const s of recent) await ctx.db.delete(s._id);
    for (let i = 0; i <= 36; i++) {
      await recordActivity(
        ctx,
        patientId,
        { deviceId: band.deviceId, steps: 0, activeMinutes: 0, heartRate: 70 + (i % 3) },
        now - i * 5 * MINUTE,
      );
    }
    // Make room for a fresh nudge.
    const nudges = await ctx.db
      .query("alerts")
      .withIndex("by_patient_created", (q) => q.eq("patientId", patientId).gte("createdAt", now - 3 * 60 * MINUTE))
      .collect();
    for (const a of nudges.filter((x) => x.kind === "low_activity")) await ctx.db.delete(a._id);
    const result = await tickPatient(ctx, patient, now);
    return { lowActivity: result.lowActivity };
  },
});

/** The band stops reporting for 16 minutes: device-offline alert. */
export const deviceOffline = mutation({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const band = await demoBand(ctx, patientId);
    await backdateDevice(ctx, band, 16);
    return { raised: await checkDevices(ctx, Date.now()) };
  },
});

export const deviceBack = mutation({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const band = await demoBand(ctx, patientId);
    await touchDevice(ctx, (await ctx.db.get(band._id))!, "simulated");
  },
});

/** A check-in without the voice agent (e.g. two "struggling" in a row). */
export const checkIn = mutation({
  args: {
    patientId: v.id("patients"),
    state: v.union(v.literal("doing_well"), v.literal("sore_but_managing"), v.literal("struggling")),
    painScore: v.number(),
    redFlag: v.optional(v.boolean()),
  },
  handler: async (ctx, { patientId, state, painScore, redFlag }) => {
    await patientOrThrow(ctx, patientId);
    const notes = redFlag ? "Says the wound looks red and feels warm (simulated)." : undefined;
    return saveCheckIn(ctx, {
      patientId,
      trigger: "manual",
      transcript: `(simulated) ${state.replaceAll("_", " ")}, pain ${painScore} out of 10${redFlag ? ", wound looks red" : ""}`,
      state,
      painScore,
      notes,
      redFlag: redFlag ?? false,
    });
  },
});

/** Runs the dose engine for this patient now, instead of waiting for the minute cron. */
export const tick = mutation({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => tickPatient(ctx, await patientOrThrow(ctx, patientId), Date.now()),
});

const PATIENT_TABLES = [
  "careTeamMembers",
  "invites",
  "medications",
  "doseEvents",
  "activitySamples",
  "events",
  "checkIns",
  "alerts",
  "summaries",
  "voiceTurns",
  "watchLists",
  "devices",
  "aiLogs",
] as const;

/** Deletes every demo patient (never a real one) and seeds a fresh one with two weeks of history. */
export const resetDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const patients = await ctx.db.query("patients").collect();
    const demo = patients.filter((p) => p.isDemo || p.ownerUserId === DEMO_OWNER);
    for (const patient of demo) {
      for (const table of PATIENT_TABLES) {
        const rows = (await ctx.db.query(table).collect()) as { _id: Id<typeof table>; patientId?: Id<"patients"> }[];
        for (const row of rows) if (row.patientId === patient._id) await ctx.db.delete(row._id);
      }
      const codes = await ctx.db.query("pairingCodes").collect();
      for (const c of codes) if (c.patientId === patient._id) await ctx.db.delete(c._id);
      await ctx.db.delete(patient._id);
    }
    return createDemoPatient(ctx);
  },
});

/** The live feed on /demo: the latest rows any simulator wrote. */
export const feed = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const patient = await ctx.db.get(patientId);
    if (!patient) return [];
    const [alerts, events, doses, checkIns] = await Promise.all([
      ctx.db
        .query("alerts")
        .withIndex("by_patient_created", (q) => q.eq("patientId", patientId))
        .order("desc")
        .take(12),
      ctx.db
        .query("events")
        .withIndex("by_patient_time", (q) => q.eq("patientId", patientId))
        .order("desc")
        .take(8),
      ctx.db
        .query("doseEvents")
        .withIndex("by_patient_time", (q) => q.eq("patientId", patientId))
        .order("desc")
        .take(8),
      ctx.db
        .query("checkIns")
        .withIndex("by_patient_time", (q) => q.eq("patientId", patientId))
        .order("desc")
        .take(6),
    ]);
    const time = (at: number) => formatLocalTime(patient.timeZone, at);
    const items = [
      ...alerts.map((a) => ({
        id: a._id,
        at: a.createdAt,
        label: `${a.tier} alert${a.kind ? ` · ${a.kind}` : ""}`,
        text: a.reason,
        status: a.status + (a.deliveredAt ? " · spoken" : ""),
      })),
      ...events.map((e) => ({
        id: e._id,
        at: e.at,
        label: `event · ${e.type}`,
        text: e.resolution ? `resolution: ${e.resolution}` : "",
        status: "",
      })),
      ...doses.map((d) => ({
        id: d._id,
        at: d.confirmedAt ?? d.openedAt ?? d.scheduledFor,
        label: `dose · ${d.status}`,
        text: `scheduled ${time(d.scheduledFor)}${d.remindersSent ? ` · reminders ${d.remindersSent}` : ""}`,
        status: d.source ?? "",
      })),
      ...checkIns.map((c) => ({
        id: c._id,
        at: c.at,
        label: `check-in · ${c.state}`,
        text: c.transcript,
        status: c.redFlag ? "red flag" : "",
      })),
    ];
    return items
      .filter((i) => i.at <= Date.now() + MINUTE)
      .sort((a, b) => b.at - a.at)
      .slice(0, 25)
      .map((i) => ({ ...i, time: time(i.at) }));
  },
});
