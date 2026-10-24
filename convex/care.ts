import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { PHASES, recoveryStatus, localDateKey } from "../lib/onboarding/recovery";
import { ROLES } from "../lib/onboarding/roles";
import { buildDaySchedule, localDayBounds, type DoseSlot } from "../lib/schedule";
import { membership } from "./onboarding";

// The caregiver and family "today" page (/care): today's medicines, check-ins
// and open alerts for one patient, plus marking a dose taken by hand.
// TODO(auth): `userId` is the demo identity; see convex/onboarding.ts.

/** Today's dose slots for a patient, as of `now`. */
export async function daySlots(ctx: QueryCtx, patient: Doc<"patients">, now: number): Promise<DoseSlot[]> {
  const { start, end } = localDayBounds(patient.timeZone, now);
  const [medications, doseEvents] = await Promise.all([
    ctx.db
      .query("medications")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .filter((q) => q.eq(q.field("active"), true))
      .collect(),
    ctx.db
      .query("doseEvents")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patient._id).gte("scheduledFor", start).lt("scheduledFor", end))
      .collect(),
  ]);
  return buildDaySchedule(
    medications.map((m) => ({ id: m._id, name: m.name, doseLabel: m.doseLabel, times: m.times, windowMinutes: m.windowMinutes })),
    doseEvents.map((e) => ({ medicationId: e.medicationId, scheduledFor: e.scheduledFor, status: e.status })),
    patient.timeZone,
    now,
  );
}

/** Every care team the caller is on, so /care and /settings know which patient to show. */
export const myTeams = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const mine = await ctx.db
      .query("careTeamMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const rows = await Promise.all(
      mine.map(async (m) => {
        const patient = await ctx.db.get(m.patientId);
        return patient
          ? { patientId: patient._id, patientName: patient.preferredName ?? patient.name, role: m.role, isOwner: m.isOwner ?? false }
          : null;
      }),
    );
    return rows.filter((r) => r !== null);
  },
});

/** Everything /care shows for one patient today. Doctors get `{ redirect }` to their report instead. */
export const today = query({
  args: { userId: v.string(), patientId: v.id("patients"), now: v.number() },
  handler: async (ctx, { userId, patientId, now }) => {
    const patient = await ctx.db.get(patientId);
    const me = patient ? await membership(ctx, patientId, userId) : null;
    if (!patient || !me) return null;
    if (me.role === "clinician") return { redirect: `/clinician/${patientId}` as const };

    const { start } = localDayBounds(patient.timeZone, now);
    const [slots, checkIns, alerts, activity] = await Promise.all([
      daySlots(ctx, patient, now),
      ctx.db
        .query("checkIns")
        .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("at", start))
        .collect(),
      ctx.db
        .query("alerts")
        .withIndex("by_patient_status", (q) => q.eq("patientId", patientId).eq("status", "open"))
        .collect(),
      ctx.db
        .query("activitySamples")
        .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("windowStart", start))
        .collect(),
    ]);
    const status = patient.recovery ? recoveryStatus(patient.recovery.surgeryDate, localDateKey(patient.timeZone, now)) : null;

    return {
      redirect: null,
      patient: {
        id: patient._id,
        name: patient.preferredName ?? patient.name,
        timeZone: patient.timeZone,
        careNotes: patient.recovery?.careNotes,
      },
      me: { name: me.name ?? "You", role: me.role, title: ROLES[me.role].title },
      recovery: status && { ...status, phaseLabel: PHASES[status.phase].label, focus: PHASES[status.phase].focus },
      slots,
      checkIns: checkIns
        .sort((a, b) => b.at - a.at)
        .map((c) => ({
          id: c._id,
          at: c.at,
          state: c.state,
          painScore: c.painScore,
          notes: c.notes,
          redFlag: c.redFlag,
          trigger: c.trigger,
          needsLook: c.redFlag || c.state === "struggling",
        })),
      alerts: alerts
        .filter((a) => a.tier !== "info")
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((a) => ({ id: a._id, tier: a.tier, reason: a.reason, createdAt: a.createdAt })),
      steps: activity.reduce((n, a) => n + a.steps, 0),
    };
  },
});

async function requireHandsOn(ctx: QueryCtx, patientId: Doc<"patients">["_id"], userId: string) {
  const me = await membership(ctx, patientId, userId);
  if (!me || me.role === "clinician") throw new Error("Only family, caregivers and the patient can do that");
  return me;
}

/** A caregiver or family member gave the dose (or saw it taken): log it as `manual`. */
export const markDoseTaken = mutation({
  args: { userId: v.string(), medicationId: v.id("medications"), scheduledFor: v.number() },
  handler: async (ctx, { userId, medicationId, scheduledFor }) => {
    const med = await ctx.db.get(medicationId);
    const patient = med ? await ctx.db.get(med.patientId) : null;
    if (!med || !patient || !med.active) throw new Error("That medicine isn't on the schedule anymore");
    await requireHandsOn(ctx, patient._id, userId);

    const slot = (await daySlots(ctx, patient, scheduledFor)).find(
      (s) => s.medicationId === medicationId && s.scheduledFor === scheduledFor,
    );
    if (!slot) throw new Error("That dose isn't on today's schedule");
    if (slot.scheduledFor - Date.now() > 3 * 60 * 60 * 1000) throw new Error("That dose isn't due for a while yet");

    const existing = await ctx.db
      .query("doseEvents")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patient._id).eq("scheduledFor", scheduledFor))
      .filter((q) => q.eq(q.field("medicationId"), medicationId))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { status: "taken", confirmedAt: now, source: "manual" });
      return existing._id;
    }
    return ctx.db.insert("doseEvents", {
      patientId: patient._id,
      medicationId,
      scheduledFor,
      status: "taken",
      confirmedAt: now,
      source: "manual",
    });
  },
});

/** "I've got it": the alert stays in the history but leaves everyone's open list. */
export const acknowledgeAlert = mutation({
  args: { userId: v.string(), alertId: v.id("alerts") },
  handler: async (ctx, { userId, alertId }) => {
    const alert = await ctx.db.get(alertId);
    if (!alert) throw new Error("That alert is gone");
    const me = await requireHandsOn(ctx, alert.patientId, userId);
    if (alert.status !== "open") return;
    await ctx.db.patch(alertId, { status: "acknowledged", acknowledgedBy: me.name ?? userId, acknowledgedAt: Date.now() });
  },
});
