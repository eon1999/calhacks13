import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { raiseAlert, resolveAlerts } from "./alerts";
import { firstName } from "./doses";
import { formatLocalTime } from "../lib/schedule";

// Falls and SOS. Ask before alerting: a fall gets a spoken "are you okay?"
// first; no answer in 30 s (or "help") becomes an urgent alert to the care team.
// TODO(auth): public mutations here are pressed from the patient's hub.

export const FALL_ANSWER_MS = 30_000;
/** A fall stays "pending" (hub shows I'm okay / I need help) for this long. */
const PENDING_FALL_MS = 5 * 60_000;

async function pendingFall(ctx: QueryCtx, patientId: Id<"patients">, now: number): Promise<Doc<"events"> | null> {
  const recent = await ctx.db
    .query("events")
    .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("at", now - PENDING_FALL_MS))
    .order("desc")
    .collect();
  return recent.find((e) => e.type === "fall" && !e.resolution) ?? null;
}

/**
 * Logs a fall and starts the 30-second answer timer. `prompt` asks the hub to
 * speak the check-in; off when the hub itself reported the fall and is already talking.
 */
export async function reportFall(
  ctx: MutationCtx,
  patientId: Id<"patients">,
  opts: { payload?: unknown; prompt: boolean; now?: number },
): Promise<Id<"events">> {
  const now = opts.now ?? Date.now();
  const eventId = await ctx.db.insert("events", { patientId, type: "fall", at: now, payload: opts.payload });
  if (opts.prompt) {
    await raiseAlert(ctx, {
      patientId,
      tier: "ask",
      kind: "fall_check",
      reason: "Possible fall. Asking if they're okay.",
      refId: eventId,
      at: now,
    });
  }
  await ctx.scheduler.runAfter(FALL_ANSWER_MS, internal.safety.escalateFall, { eventId });
  return eventId;
}

export async function reportSos(
  ctx: MutationCtx,
  patientId: Id<"patients">,
  opts: { payload?: unknown; prompt: boolean; now?: number },
): Promise<Id<"events">> {
  const patient = await ctx.db.get(patientId);
  if (!patient) throw new Error("Patient not found");
  const now = opts.now ?? Date.now();
  const eventId = await ctx.db.insert("events", {
    patientId,
    type: "sos",
    at: now,
    payload: opts.payload,
    resolution: "helped",
  });
  await raiseAlert(ctx, {
    patientId,
    tier: "urgent",
    kind: "sos",
    reason: `${firstName(patient)} pressed the SOS button at ${formatLocalTime(patient.timeZone, now)}. Call them now; if you can't reach them, call 911.`,
    refId: eventId,
    at: now,
  });
  if (opts.prompt) {
    await raiseAlert(ctx, {
      patientId,
      tier: "ask",
      kind: "sos_prompt",
      reason: "SOS pressed. Telling them the care team is being contacted.",
      refId: eventId,
      at: now,
    });
  }
  return eventId;
}

export const escalateFall = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event || event.resolution) return;
    const patient = await ctx.db.get(event.patientId);
    if (!patient) return;
    await ctx.db.patch(eventId, { resolution: "unresolved" });
    await resolveAlerts(ctx, event.patientId, ["fall_check"], { refId: eventId, by: "No answer" });
    await raiseAlert(ctx, {
      patientId: event.patientId,
      tier: "urgent",
      kind: "fall_unanswered",
      reason: `Possible fall at ${formatLocalTime(patient.timeZone, event.at)}, and ${firstName(patient)} didn't answer for 30 seconds. Call them now; if you can't reach them, call 911.`,
      refId: eventId,
    });
  },
});

/** The patient says they're fine (hub button, band button, or voice). Cancels the alert timer. */
export async function resolveFallOk(ctx: MutationCtx, patientId: Id<"patients">, now = Date.now()): Promise<boolean> {
  const fall = await pendingFall(ctx, patientId, now);
  if (!fall) return false;
  await ctx.db.patch(fall._id, { resolution: "ok" });
  await resolveAlerts(ctx, patientId, ["fall_check"], { refId: fall._id, by: "Said they're okay" });
  await raiseAlert(ctx, {
    patientId,
    tier: "info",
    kind: "fall_check",
    reason: "Possible fall; they said they're okay, so nobody was alerted.",
    refId: fall._id,
    at: now,
  });
  return true;
}

/** The patient asked for help, or the agent escalated, while a fall was pending. */
export async function resolveFallHelped(ctx: MutationCtx, patientId: Id<"patients">, now = Date.now()): Promise<boolean> {
  const fall = await pendingFall(ctx, patientId, now);
  if (!fall) return false;
  await ctx.db.patch(fall._id, { resolution: "helped" });
  await resolveAlerts(ctx, patientId, ["fall_check"], { refId: fall._id, by: "Asked for help" });
  return true;
}

/** Hub "I'm okay" button. */
export const imOkay = mutation({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => resolveFallOk(ctx, patientId),
});

/** Hub "I need help" button: urgent alert right away. */
export const needHelp = mutation({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const patient = await ctx.db.get(patientId);
    if (!patient) throw new Error("Patient not found");
    const now = Date.now();
    const hadFall = await resolveFallHelped(ctx, patientId, now);
    await raiseAlert(ctx, {
      patientId,
      tier: "urgent",
      kind: hadFall ? "fall_unanswered" : "sos",
      reason: `${firstName(patient)} asked for help${hadFall ? " after a possible fall" : ""} at ${formatLocalTime(patient.timeZone, now)}. Call them now; if you can't reach them, call 911.`,
      at: now,
    });
  },
});

/** For the hub's "Are you okay?" banner. */
export const pending = query({
  args: { patientId: v.id("patients"), now: v.number() },
  handler: async (ctx, { patientId, now }) => {
    const fall = await pendingFall(ctx, patientId, now);
    return fall ? { eventId: fall._id, at: fall.at, answerBy: fall.at + FALL_ANSWER_MS } : null;
  },
});
