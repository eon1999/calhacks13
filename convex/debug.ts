import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { localDayBounds } from "../lib/schedule";

// Tester tooling for the /hub debug panel. Reached only through the
// debug-gated routes in app/api/debug/*.
// TODO: like convex/voice.ts these are public; lock down before real use.

const ACTIVITY_LIMIT = 8;

/** Recent things the agent and wearable wrote, so testers can see effects. */
export const activity = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const [alerts, checkIns, events, doseEvents] = await Promise.all([
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
    ]);
    return { alerts, checkIns, events, doseEvents };
  },
});

/**
 * Wipe today's test data for one patient: dose confirmations, check-ins,
 * alerts, safety events, and voice conversation history.
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
    const turns = (await ctx.db.query("voiceTurns").collect()).filter(
      (t) => t.patientId === patientId,
    );

    const all = [...doseEvents, ...checkIns, ...events, ...alerts, ...turns];
    await Promise.all(all.map((doc) => ctx.db.delete(doc._id)));
    return {
      doseEvents: doseEvents.length,
      checkIns: checkIns.length,
      events: events.length,
      alerts: alerts.length,
      voiceTurns: turns.length,
    };
  },
});
