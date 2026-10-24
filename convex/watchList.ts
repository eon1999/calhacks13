import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { mobilityInfo } from "../lib/onboarding/health";
import { localDateKey, procedureId, procedureLabel, recoveryStatus } from "../lib/onboarding/recovery";
import { watchListSchema } from "../lib/watch-list";

// Per-patient watch list (heart rate, temperature, movement), researched in the
// background by convex/agent.ts once onboarding is finished.
// TODO(auth): public like convex/profile.ts; gate before real use.

/** A run that hasn't finished in this long is treated as dead and can be restarted. */
const STALE_MS = 10 * 60_000;

export const get = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) =>
    ctx.db
      .query("watchLists")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .unique(),
});

/** Start (or restart) research for this patient. No-op while a fresh run is in flight. */
export const request = mutation({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    if (!(await ctx.db.get(patientId))) throw new Error("Patient not found");
    const now = Date.now();
    const existing = await ctx.db
      .query("watchLists")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .unique();
    if (existing?.status === "researching" && now - existing.requestedAt < STALE_MS) return;

    if (existing) {
      await ctx.db.patch(existing._id, { status: "researching", requestedAt: now, error: undefined });
    } else {
      await ctx.db.insert("watchLists", { patientId, status: "researching", requestedAt: now });
    }
    await ctx.scheduler.runAfter(0, internal.agent.researchWatchList, { patientId });
  },
});

/** Plain-text patient summary the research agent works from. */
export const profileFor = internalQuery({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const p = await ctx.db.get(patientId);
    if (!p) return null;
    const meds = await ctx.db
      .query("medications")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    const lines: string[] = [];
    if (p.recovery) {
      const parsed = procedureId.safeParse(p.recovery.procedure);
      const what = parsed.success ? procedureLabel(parsed.data, p.recovery.procedureOther) : p.recovery.procedure;
      const status = recoveryStatus(p.recovery.surgeryDate, localDateKey(p.timeZone, Date.now()));
      lines.push(`Surgery: ${what} (${status.label})`);
      if (p.recovery.careNotes) lines.push(`Discharge notes: ${p.recovery.careNotes}`);
    } else {
      lines.push("Surgery: not specified");
    }
    lines.push(`Other conditions: ${p.health?.conditions.join(", ") || "none listed"}`);
    lines.push(`Medicines: ${meds.map((m) => `${m.name} (${m.doseLabel})`).join(", ") || "none listed"}`);
    const mobility = mobilityInfo(p.health?.mobility);
    if (mobility) lines.push(`Gets around: ${mobility.label.toLowerCase()}`);
    if (p.health?.notes) lines.push(`Health notes: ${p.health.notes}`);
    return { description: lines.join("\n") };
  },
});

export const complete = internalMutation({
  args: { patientId: v.id("patients"), result: v.any(), model: v.string() },
  handler: async (ctx, { patientId, result, model }) => {
    const row = await ctx.db
      .query("watchLists")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .unique();
    if (!row) return;
    await ctx.db.patch(row._id, {
      status: "ready",
      result: watchListSchema.parse(result),
      model,
      completedAt: Date.now(),
      error: undefined,
    });
  },
});

export const fail = internalMutation({
  args: { patientId: v.id("patients"), error: v.string() },
  handler: async (ctx, { patientId, error }) => {
    const row = await ctx.db
      .query("watchLists")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .unique();
    if (row) await ctx.db.patch(row._id, { status: "failed", error, completedAt: Date.now() });
  },
});
