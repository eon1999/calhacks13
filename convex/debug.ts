import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { localDayBounds } from "../lib/schedule";
import { raiseAlert as insertAlert } from "./alerts";
import { optionalPhone } from "./onboarding";

// Tester tooling for the /hub debug panel. Reached only through the
// debug-gated routes in app/api/debug/*.
// TODO: like convex/voice.ts these are public; lock down before real use.

const ACTIVITY_LIMIT = 8;

/** Recent things the agent and wearable wrote, so testers can see effects. */
export const activity = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const patient = await ctx.db.get(patientId);
    const [alerts, checkIns, events, doseEvents, texts] = await Promise.all([
      ctx.db
        .query("alerts")
        .withIndex("by_patient_status", (q) => q.eq("patientId", patientId))
        .collect()
        .then((all) => all.sort((a, b) => b.createdAt - a.createdAt).slice(0, ACTIVITY_LIMIT)),
      ctx.db
        .query("checkIns")
        .withIndex("by_patient_time", (q) => q.eq("patientId", patientId))
        .order("desc")
        .take(ACTIVITY_LIMIT),
      ctx.db
        .query("events")
        .withIndex("by_patient_time", (q) => q.eq("patientId", patientId))
        .order("desc")
        .take(ACTIVITY_LIMIT),
      ctx.db
        .query("doseEvents")
        .withIndex("by_patient_time", (q) => q.eq("patientId", patientId))
        .order("desc")
        .take(ACTIVITY_LIMIT),
      ctx.db
        .query("textMessages")
        .withIndex("by_patient_time", (q) => q.eq("patientId", patientId))
        .order("desc")
        .take(ACTIVITY_LIMIT),
    ]);
    return { alerts, checkIns, events, doseEvents, texts, testTextTo: patient?.testTextTo ?? null };
  },
});

/** Send every alert for this patient to one test number instead of the care team. Empty string turns it off. */
export const setTestTextTo = mutation({
  args: { patientId: v.id("patients"), phone: v.string() },
  handler: async (ctx, { patientId, phone }) => {
    if (!(await ctx.db.get(patientId))) throw new Error("Patient not found");
    const testTextTo = optionalPhone(phone);
    await ctx.db.patch(patientId, { testTextTo });
    return testTextTo ?? null;
  },
});

/** Raise an alert without the agent, so testers can check the texting path on its own. */
export const raiseAlert = mutation({
  args: {
    patientId: v.id("patients"),
    tier: v.union(v.literal("ask"), v.literal("notify"), v.literal("urgent")),
    reason: v.string(),
  },
  handler: async (ctx, { patientId, tier, reason }) => {
    if (!(await ctx.db.get(patientId))) throw new Error("Patient not found");
    const clean = reason.trim().slice(0, 300);
    if (!clean) throw new Error("Say what the alert is about");
    // "voice_agent": what the agent's own alert_care_team raises, so it's texted like a real one.
    return await insertAlert(ctx, { patientId, tier, kind: "voice_agent", reason: clean });
  },
});

/**
 * Wipe today's test data for one patient: dose confirmations, check-ins,
 * alerts, texts, safety events, and voice conversation history.
 */
export const resetToday = mutation({
  args: { patientId: v.id("patients"), now: v.number() },
  handler: async (ctx, { patientId, now }) => {
    const patient = await ctx.db.get(patientId);
    if (!patient) throw new Error("Patient not found");
    const { start, end } = localDayBounds(patient.timeZone, now);

    const doseEvents = await ctx.db
      .query("doseEvents")
      .withIndex("by_patient_time", (q) =>
        q.eq("patientId", patientId).gte("scheduledFor", start).lt("scheduledFor", end),
      )
      .collect();
    const checkIns = await ctx.db
      .query("checkIns")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("at", start))
      .collect();
    const events = await ctx.db
      .query("events")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("at", start))
      .collect();
    const alerts = (
      await ctx.db
        .query("alerts")
        .withIndex("by_patient_status", (q) => q.eq("patientId", patientId))
        .collect()
    ).filter((a) => a.createdAt >= start);
    const texts = await ctx.db
      .query("textMessages")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("at", start))
      .collect();
    const turns = (await ctx.db.query("voiceTurns").collect()).filter(
      (t) => t.patientId === patientId,
    );

    const all = [...doseEvents, ...checkIns, ...events, ...alerts, ...texts, ...turns];
    await Promise.all(all.map((doc) => ctx.db.delete(doc._id)));
    return {
      doseEvents: doseEvents.length,
      checkIns: checkIns.length,
      events: events.length,
      alerts: alerts.length,
      textMessages: texts.length,
      voiceTurns: turns.length,
    };
  },
});
