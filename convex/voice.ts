import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolvePreferences } from "../lib/notify/preferences";
import { localDayBounds } from "../lib/schedule";
import { openAlert } from "./notify";

// Functions backing the voice agent (lib/voice/*). Called from Next.js route
// handlers via ConvexHttpClient.
// TODO: these are public functions. Before real use, gate them behind a
// server secret or device-token auth (see convex/http.ts TODO).

const HISTORY_LIMIT = 30;

export const firstPatient = query({
  args: {},
  handler: async (ctx) => ctx.db.query("patients").first(),
});

/** Everything the agent needs to reason about today: patient, meds, today's doses. */
export const getContext = query({
  args: { patientId: v.id("patients"), now: v.number() },
  handler: async (ctx, { patientId, now }) => {
    const patient = await ctx.db.get(patientId);
    if (!patient) return null;

    const medications = await ctx.db
      .query("medications")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    const { start, end } = localDayBounds(patient.timeZone, now);
    const doseEvents = await ctx.db
      .query("doseEvents")
      .withIndex("by_patient_time", (q) =>
        q.eq("patientId", patientId).gte("scheduledFor", start).lt("scheduledFor", end),
      )
      .collect();

    const lastCheckIn = await ctx.db
      .query("checkIns")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId))
      .order("desc")
      .first();

    // What's already been done today, so the agent doesn't repeat it across turns.
    const checkInsToday = await ctx.db
      .query("checkIns")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("at", start))
      .collect();
    const alertsToday = (
      await ctx.db
        .query("alerts")
        .withIndex("by_patient_status", (q) => q.eq("patientId", patientId))
        .collect()
    ).filter((a) => a.createdAt >= start);

    const careTeam = (
      await ctx.db
        .query("careTeamMembers")
        .withIndex("by_patient", (q) => q.eq("patientId", patientId))
        .collect()
    )
      .filter((m) => m.role !== "patient")
      .map((m) => ({
        name: m.name ?? "a care team member",
        role: m.role,
        relationship: m.relationship,
        urgentAlerts: resolvePreferences(m.notifications, m.urgentAlerts).urgent,
      }));

    return { patient, medications, doseEvents, lastCheckIn, checkInsToday, alertsToday, careTeam };
  },
});

export const confirmDose = mutation({
  args: {
    patientId: v.id("patients"),
    medicationId: v.id("medications"),
    scheduledFor: v.number(),
  },
  handler: async (ctx, { patientId, medicationId, scheduledFor }) => {
    const med = await ctx.db.get(medicationId);
    if (!med || med.patientId !== patientId) {
      throw new Error("Medication does not belong to this patient");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("doseEvents")
      .withIndex("by_patient_time", (q) =>
        q.eq("patientId", patientId).eq("scheduledFor", scheduledFor),
      )
      .filter((q) => q.eq(q.field("medicationId"), medicationId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "taken",
        confirmedAt: now,
        source: "voice",
      });
      return existing._id;
    }
    return ctx.db.insert("doseEvents", {
      patientId,
      medicationId,
      scheduledFor,
      status: "taken",
      confirmedAt: now,
      source: "voice",
    });
  },
});

const checkInState = v.union(
  v.literal("doing_well"),
  v.literal("sore_but_managing"),
  v.literal("struggling"),
  v.literal("unsure"),
);

const checkInTrigger = v.union(
  v.literal("scheduled"),
  v.literal("low_activity"),
  v.literal("fall"),
  v.literal("manual"),
);

export const recordCheckIn = mutation({
  args: {
    patientId: v.id("patients"),
    trigger: checkInTrigger,
    transcript: v.string(),
    state: checkInState,
    painScore: v.optional(v.number()),
    notes: v.optional(v.string()),
    redFlag: v.boolean(),
  },
  handler: async (ctx, args) => {
    const at = Date.now();
    const checkInId = await ctx.db.insert("checkIns", { ...args, at });
    if (args.redFlag) {
      await openAlert(ctx, {
        patientId: args.patientId,
        tier: "notify",
        reason: `Check-in red flag: ${args.notes ?? args.state}`,
      });
    }
    return checkInId;
  },
});

export const createAlert = mutation({
  args: {
    patientId: v.id("patients"),
    tier: v.union(v.literal("ask"), v.literal("notify"), v.literal("urgent")),
    reason: v.string(),
  },
  handler: async (ctx, { patientId, tier, reason }) => openAlert(ctx, { patientId, tier, reason }),
});

/** The patient's spoken answer to the band's first-boot consent question. */
export const recordConsent = mutation({
  args: {
    patientId: v.id("patients"),
    agreed: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { patientId, agreed, notes }) => {
    const at = Date.now();
    await ctx.db.patch(patientId, {
      consent: { status: agreed ? "agreed" : "declined", at, notes },
    });
    if (!agreed) {
      // A "no" doesn't switch anything off; it asks the family to talk it through.
      await openAlert(ctx, {
        patientId,
        tier: "ask",
        reason: `Didn't agree to sharing updates with the care team yet${notes ? `: ${notes}` : ""}. Worth a conversation.`,
      });
    }
  },
});

/** Safety events reported by the wearable (fall, SOS), kept for the care team. */
export const logDeviceEvent = mutation({
  args: {
    patientId: v.id("patients"),
    type: v.union(v.literal("fall"), v.literal("sos")),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, { patientId, type, payload }) =>
    ctx.db.insert("events", { patientId, type, at: Date.now(), payload }),
});

export const getTurns = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const recent = await ctx.db
      .query("voiceTurns")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(HISTORY_LIMIT);
    return recent.reverse();
  },
});

export const appendTurns = mutation({
  args: {
    patientId: v.id("patients"),
    sessionId: v.string(),
    turns: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant"), v.literal("event")),
        text: v.string(),
        event: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { patientId, sessionId, turns }) => {
    const base = Date.now();
    // Offset by index so ordering within one append is stable.
    for (const [i, turn] of turns.entries()) {
      await ctx.db.insert("voiceTurns", { patientId, sessionId, ...turn, at: base + i });
    }
  },
});
