import { v, type ObjectType } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { localDayBounds } from "../lib/schedule";
import { raiseAlert } from "./alerts";
import { isCareAlert } from "../lib/alerts";
import { doseConfirmed } from "./doses";
import { reportFall, reportSos, resolveFallHelped, resolveFallOk } from "./safety";

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
    ).filter((a) => a.createdAt >= start && isCareAlert(a));

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
        urgentAlerts: m.urgentAlerts ?? false,
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

    await doseConfirmed(ctx, patientId, scheduledFor);
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "taken",
        confirmedAt: now,
        // Keep "pillbox" when the lid opening started it; voice upgrades it to taken.
        source: existing.source ?? "voice",
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

export const checkInArgs = {
  patientId: v.id("patients"),
  trigger: checkInTrigger,
  transcript: v.string(),
  state: checkInState,
  painScore: v.optional(v.number()),
  notes: v.optional(v.string()),
  redFlag: v.boolean(),
};

/** Saves a check-in and raises what it calls for. Shared with the /demo simulator. */
export async function saveCheckIn(ctx: MutationCtx, args: ObjectType<typeof checkInArgs>) {
  const at = Date.now();
  const previous = await ctx.db
    .query("checkIns")
    .withIndex("by_patient_time", (q) => q.eq("patientId", args.patientId))
    .order("desc")
    .first();
  const checkInId = await ctx.db.insert("checkIns", { ...args, at });
  if (args.redFlag) {
    await raiseAlert(ctx, {
      patientId: args.patientId,
      tier: "notify",
      kind: "red_flag",
      reason: `Check-in red flag: ${args.notes ?? args.state}`,
      refId: checkInId,
      at,
    });
  } else if (args.state === "struggling" && previous?.state === "struggling") {
    await raiseAlert(ctx, {
      patientId: args.patientId,
      tier: "notify",
      kind: "struggling_twice",
      reason: `Two check-ins in a row where they said they're struggling${args.notes ? ` (latest: ${args.notes})` : ""}.`,
      refId: checkInId,
      at,
    });
  }
  // A calm answer to "are you okay?" after a fall cancels the alert timer.
  if (args.trigger === "fall" && !args.redFlag && args.state !== "struggling") {
    await resolveFallOk(ctx, args.patientId, at);
  }
  return checkInId;
}

export const recordCheckIn = mutation({
  args: checkInArgs,
  handler: async (ctx, args) => saveCheckIn(ctx, args),
});

export const createAlert = mutation({
  args: {
    patientId: v.id("patients"),
    tier: v.union(v.literal("ask"), v.literal("notify"), v.literal("urgent")),
    reason: v.string(),
  },
  handler: async (ctx, { patientId, tier, reason }) => {
    if (tier === "urgent") await resolveFallHelped(ctx, patientId);
    return raiseAlert(ctx, { patientId, tier, kind: "voice_agent", reason });
  },
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
      await raiseAlert(ctx, {
        patientId,
        tier: "ask",
        kind: "consent",
        reason: `Didn't agree to sharing updates with the care team yet${notes ? `: ${notes}` : ""}. Worth a conversation.`,
        at,
      });
    }
  },
});

/**
 * Safety events reported by the wearable simulator (fall, SOS), kept for the
 * care team. The hub is already speaking, so no spoken prompt is queued; a
 * fall still starts the 30-second answer timer and SOS still alerts urgently.
 */
export const logDeviceEvent = mutation({
  args: {
    patientId: v.id("patients"),
    type: v.union(v.literal("fall"), v.literal("sos")),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, { patientId, type, payload }) =>
    type === "fall"
      ? reportFall(ctx, patientId, { payload, prompt: false })
      : reportSos(ctx, patientId, { payload, prompt: false }),
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
