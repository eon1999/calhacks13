import { v } from "convex/values";
import { query } from "./_generated/server";
import { PHASES, procedureLabel, recoveryStatus, localDateKey, type ProcedureId } from "../lib/onboarding/recovery";
import { adherenceByDay, adherencePercent, localMidnight, reportDays } from "../lib/report/recovery";
import { membership } from "./onboarding";

// The clinician recovery report (/clinician/[patientId]). Read-only, for
// members with the `report` permission (doctors by default).
// TODO(auth): `userId` is the demo identity; see convex/onboarding.ts.

const MAX_DAYS = 14;

export const recovery = query({
  args: { userId: v.string(), patientId: v.id("patients"), days: v.number(), now: v.number() },
  handler: async (ctx, { userId, patientId, days, now }) => {
    const patient = await ctx.db.get(patientId);
    const me = patient ? await membership(ctx, patientId, userId) : null;
    if (!patient || !me) return { allowed: false as const, reason: "not_member" as const };
    if (!me.permissions.includes("report")) return { allowed: false as const, reason: "no_permission" as const };

    const range = reportDays(patient.timeZone, now, Math.min(Math.max(1, Math.round(days)), MAX_DAYS));
    const from = range[0].start;
    const [medications, doseEvents, checkIns, events, alerts] = await Promise.all([
      ctx.db
        .query("medications")
        .withIndex("by_patient", (q) => q.eq("patientId", patientId))
        .filter((q) => q.eq(q.field("active"), true))
        .collect(),
      ctx.db
        .query("doseEvents")
        .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("scheduledFor", from))
        .collect(),
      ctx.db
        .query("checkIns")
        .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("at", from))
        .collect(),
      ctx.db
        .query("events")
        .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("at", from))
        .collect(),
      ctx.db
        .query("alerts")
        .withIndex("by_patient_status", (q) => q.eq("patientId", patientId))
        .collect()
        .then((all) => all.filter((a) => a.createdAt >= from)),
    ]);

    // Medicines count from the day the patient got home on them.
    const homeFrom = patient.recovery
      ? localMidnight(patient.timeZone, patient.recovery.dischargeDate ?? patient.recovery.surgeryDate)
      : 0;
    const adherence = adherenceByDay(
      medications.map((m) => ({
        id: m._id,
        name: m.name,
        doseLabel: m.doseLabel,
        times: m.times,
        windowMinutes: m.windowMinutes,
        countFrom: patient.recovery ? homeFrom : m._creationTime,
      })),
      doseEvents.map((e) => ({ medicationId: e.medicationId, scheduledFor: e.scheduledFor, status: e.status })),
      patient.timeZone,
      range,
      now,
    );

    const status = patient.recovery ? recoveryStatus(patient.recovery.surgeryDate, localDateKey(patient.timeZone, now)) : null;
    const sortedCheckIns = checkIns.sort((a, b) => a.at - b.at);
    return {
      allowed: true as const,
      patient: {
        name: patient.name,
        timeZone: patient.timeZone,
        procedure: patient.recovery
          ? procedureLabel(patient.recovery.procedure as ProcedureId, patient.recovery.procedureOther)
          : null,
        surgeryDate: patient.recovery?.surgeryDate ?? null,
        dischargeDate: patient.recovery?.dischargeDate ?? null,
        careNotes: patient.recovery?.careNotes ?? null,
        conditions: patient.health?.conditions ?? [],
        allergies: patient.health?.allergies ?? [],
      },
      recovery: status && { ...status, phaseLabel: PHASES[status.phase].label },
      days: range.map((d) => d.date),
      adherence,
      adherencePercent: adherencePercent(adherence),
      medications: medications.map((m) => ({ name: m.name, doseLabel: m.doseLabel, times: m.times })),
      checkIns: sortedCheckIns.map((c) => ({
        id: c._id,
        at: c.at,
        date: localDateKey(patient.timeZone, c.at),
        state: c.state,
        painScore: c.painScore ?? null,
        notes: c.notes ?? null,
        redFlag: c.redFlag,
        trigger: c.trigger,
      })),
      safetyEvents: events
        .filter((e) => e.type === "fall" || e.type === "sos")
        .sort((a, b) => a.at - b.at)
        .map((e) => ({ id: e._id, type: e.type, at: e.at, resolution: e.resolution ?? null })),
      alerts: alerts
        .filter((a) => a.tier === "urgent" || a.tier === "notify")
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((a) => ({ id: a._id, tier: a.tier, reason: a.reason, at: a.createdAt, status: a.status })),
    };
  },
});
