import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { firstName, loadSlots, localHour } from "./doses";
import { computeStats, localDate, type ReportInput } from "../lib/reports/stats";
import type { DayTimelineItem } from "../lib/reports/summaries";
import { localDayBounds } from "../lib/schedule";
import { localDateKey, procedureLabel, recoveryStatus, type ProcedureId } from "../lib/onboarding/recovery";

// Data for the care dashboard, the clinician report and the Claude summaries
// (convex/ai.ts). Numbers come from lib/reports/stats.ts.
// TODO(auth): public; gate on care-team membership and permissions with Clerk.

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 62;

export async function loadReportInput(
  ctx: QueryCtx,
  patient: Doc<"patients">,
  from: number,
  to: number,
): Promise<ReportInput> {
  const patientId = patient._id;
  const [meds, doses, checkIns, events, activity] = await Promise.all([
    ctx.db
      .query("medications")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect(),
    ctx.db
      .query("doseEvents")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("scheduledFor", from).lt("scheduledFor", to))
      .collect(),
    ctx.db
      .query("checkIns")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("at", from).lt("at", to))
      .collect(),
    ctx.db
      .query("events")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("at", from).lt("at", to))
      .collect(),
    ctx.db
      .query("activitySamples")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("windowStart", from).lt("windowStart", to))
      .collect(),
  ]);
  const medById = new Map(meds.map((m) => [m._id as string, m]));
  return {
    timeZone: patient.timeZone,
    from,
    to,
    doses: doses.map((d) => ({
      id: d._id,
      medicationId: d.medicationId,
      medicationName: medById.get(d.medicationId)?.name ?? "Medicine",
      windowMinutes: medById.get(d.medicationId)?.windowMinutes ?? 30,
      scheduledFor: d.scheduledFor,
      status: d.status,
      openedAt: d.openedAt,
      confirmedAt: d.confirmedAt,
    })),
    checkIns: checkIns.map((c) => ({
      id: c._id,
      at: c.at,
      state: c.state,
      painScore: c.painScore,
      notes: c.notes,
      redFlag: c.redFlag,
      trigger: c.trigger,
    })),
    events: events.map((e) => ({ id: e._id, type: e.type, at: e.at, resolution: e.resolution })),
    activity: activity.map((a) => ({
      windowStart: a.windowStart,
      steps: a.steps,
      activeMinutes: a.activeMinutes,
      heartRate: a.heartRate,
    })),
  };
}

export function patientSummary(patient: Doc<"patients">, now: number) {
  const recovery = patient.recovery
    ? {
        procedure: procedureLabel(patient.recovery.procedure as ProcedureId, patient.recovery.procedureOther),
        surgeryDate: patient.recovery.surgeryDate,
        ...recoveryStatus(patient.recovery.surgeryDate, localDateKey(patient.timeZone, now)),
      }
    : null;
  return {
    _id: patient._id,
    name: patient.name,
    firstName: firstName(patient),
    timeZone: patient.timeZone,
    isDemo: patient.isDemo ?? false,
    recovery,
    consent: patient.consent?.status ?? null,
  };
}

/** Patients this browser can pick. Signed out (demo mode), every patient. */
export const patients = query({
  args: {},
  handler: async (ctx) => {
    let all = await ctx.db.query("patients").collect();
    // Signed in: your own care-team patients, plus the simulated demo patient.
    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      const mine = await ctx.db
        .query("careTeamMembers")
        .withIndex("by_user", (q) => q.eq("userId", identity.subject))
        .collect();
      const ids = new Set<string>(mine.map((m) => m.patientId));
      all = all.filter((p) => ids.has(p._id) || p.isDemo);
    }
    const now = Date.now();
    return all.map((p) => patientSummary(p, now)).sort((a, b) => Number(b.isDemo) - Number(a.isDemo));
  },
});

type TimelineKind = "dose" | "check_in" | "fall" | "sos" | "lid_open" | "device_offline" | "alert";

export interface TimelineEntry {
  id: string;
  at: number;
  kind: TimelineKind;
  title: string;
  detail?: string;
  tone: "good" | "neutral" | "warn" | "bad";
}

const STATE_LABEL: Record<Doc<"checkIns">["state"], string> = {
  doing_well: "Doing well",
  sore_but_managing: "Sore but managing",
  struggling: "Struggling",
  unsure: "Unsure",
};

const DOSE_LABEL: Record<Doc<"doseEvents">["status"], { title: string; tone: TimelineEntry["tone"] }> = {
  due: { title: "Due", tone: "neutral" },
  opened: { title: "Pillbox opened (not yet confirmed)", tone: "neutral" },
  taken: { title: "Taken", tone: "good" },
  late: { title: "Taken late", tone: "warn" },
  missed: { title: "Missed", tone: "bad" },
  extra_opening: { title: "Pillbox opened again", tone: "warn" },
};

async function dayTimeline(ctx: QueryCtx, patient: Doc<"patients">, start: number, end: number): Promise<TimelineEntry[]> {
  const input = await loadReportInput(ctx, patient, start, end);
  const checkIns = await ctx.db
    .query("checkIns")
    .withIndex("by_patient_time", (q) => q.eq("patientId", patient._id).gte("at", start).lt("at", end))
    .collect();
  const entries: TimelineEntry[] = [];

  // One entry per dose time (medicines in the same compartment share it).
  const byTime = new Map<number, typeof input.doses>();
  for (const d of input.doses) {
    if (d.status === "due") continue;
    byTime.set(d.scheduledFor, [...(byTime.get(d.scheduledFor) ?? []), d]);
  }
  for (const [scheduledFor, group] of byTime) {
    const d = group[0];
    const label = DOSE_LABEL[d.status];
    const at = d.status === "missed" ? scheduledFor + d.windowMinutes * 60_000 : (d.confirmedAt ?? d.openedAt ?? scheduledFor);
    entries.push({
      id: d.id,
      at,
      kind: "dose",
      title: `${label.title}: ${group.map((x) => x.medicationName).join(", ")}`,
      detail: d.status === "extra_opening" ? "Already taken earlier; Cadence reminded them." : `Scheduled ${new Intl.DateTimeFormat("en-US", { timeZone: patient.timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(scheduledFor))}`,
      tone: label.tone,
    });
  }
  for (const c of checkIns) {
    entries.push({
      id: c._id,
      at: c.at,
      kind: "check_in",
      title: `Check-in: ${STATE_LABEL[c.state]}${c.painScore !== undefined ? ` · pain ${c.painScore}/10` : ""}`,
      detail: c.notes ?? `“${c.transcript}”`,
      tone: c.redFlag || c.state === "struggling" ? "bad" : c.state === "sore_but_managing" ? "warn" : "good",
    });
  }
  for (const e of input.events) {
    if (e.type === "lid_open") continue; // shown through the dose it opened
    entries.push({
      id: e.id,
      at: e.at,
      kind: e.type,
      title:
        e.type === "fall"
          ? `Possible fall${e.resolution === "ok" ? ": said they're okay" : e.resolution === "helped" ? ": asked for help" : e.resolution === "unresolved" ? ": no answer, care team alerted" : ": asking if they're okay"}`
          : e.type === "sos"
            ? "SOS button pressed"
            : "Device offline",
      tone: e.type === "fall" && e.resolution === "ok" ? "warn" : e.type === "device_offline" ? "warn" : "bad",
    });
  }
  return entries.sort((a, b) => a.at - b.at);
}

/** Everything on the care dashboard except the alert list (convex/alerts.ts forCare). */
export const care = query({
  args: { patientId: v.id("patients"), now: v.number() },
  handler: async (ctx, { patientId, now }) => {
    const patient = await ctx.db.get(patientId);
    if (!patient) return null;
    const { start, end } = localDayBounds(patient.timeZone, now);

    const slots = (await loadSlots(ctx, patient, now)).filter((s) => s.scheduledFor >= start && s.scheduledFor < end);
    const doses = slots.map((s) => {
      const windowOpen = now >= s.scheduledFor - s.windowMs;
      const status = s.dose?.status ?? (now > s.scheduledFor + s.windowMs ? "missed" : windowOpen ? "due" : "upcoming");
      return {
        key: `${s.medicationId}@${s.scheduledFor}`,
        name: s.name,
        doseLabel: s.doseLabel,
        scheduledFor: s.scheduledFor,
        status: s.dose || s.eligible || !windowOpen ? status : "not_scheduled",
        at: s.dose?.confirmedAt ?? s.dose?.openedAt,
      };
    });

    const activity = await ctx.db
      .query("activitySamples")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("windowStart", start).lt("windowStart", end))
      .collect();

    const weekFrom = start - 6 * DAY_MS;
    const week = computeStats(await loadReportInput(ctx, patient, weekFrom, Math.min(end, now)));

    const summary = await ctx.db
      .query("summaries")
      .withIndex("by_patient_kind", (q) => q.eq("patientId", patientId).eq("kind", "daily"))
      .order("desc")
      .first();

    const team = await ctx.db
      .query("careTeamMembers")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect();

    return {
      patient: patientSummary(patient, now),
      doses,
      timeline: await dayTimeline(ctx, patient, start, end),
      activity: activity
        .sort((a, b) => a.windowStart - b.windowStart)
        .map((a) => ({ at: a.windowStart, steps: a.steps, heartRate: a.heartRate ?? null })),
      week: {
        rate: week.adherence.rate,
        onTime: week.adherence.onTime,
        late: week.adherence.late,
        missed: week.adherence.missed,
        days: week.days,
        stepsPerDay: week.activity.stepsPerDay,
        painAverage: week.pain.average,
      },
      summary: summary
        ? { body: summary.body, createdAt: summary.createdAt, model: summary.model, periodEnd: summary.periodEnd }
        : null,
      team: team
        .filter((m) => m.role !== "patient")
        .map((m) => ({ name: m.name ?? "Care team member", role: m.role, relationship: m.relationship })),
    };
  },
});

function clampRange(from: number, to: number): { from: number; to: number } {
  if (!(to > from)) throw new Error("Pick an end date after the start date");
  return { from: Math.max(from, to - MAX_RANGE_DAYS * DAY_MS), to };
}

/** The clinician report: stats, the rows they came from, and the latest Claude write-up. */
export const clinician = query({
  args: { patientId: v.id("patients"), from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient) return null;
    const { from, to } = clampRange(args.from, args.to);
    const input = await loadReportInput(ctx, patient, from, to);
    const stats = computeStats(input);
    const checkIns = await ctx.db
      .query("checkIns")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patient._id).gte("at", from).lt("at", to))
      .collect();

    const reports = await ctx.db
      .query("summaries")
      .withIndex("by_patient_kind", (q) => q.eq("patientId", patient._id).eq("kind", "clinician"))
      .order("desc")
      .take(10);
    // A saved report matches if it covers the same local days.
    const fromDay = localDate(patient.timeZone, from);
    const toDay = localDate(patient.timeZone, to - 1);
    const report = reports.find(
      (r) => localDate(patient.timeZone, r.periodStart) === fromDay && localDate(patient.timeZone, r.periodEnd - 1) === toDay,
    );

    const meds = await ctx.db
      .query("medications")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    return {
      patient: {
        ...patientSummary(patient, to),
        health: patient.health ?? null,
        careNotes: patient.recovery?.careNotes ?? null,
      },
      medications: meds.map((m) => ({ name: m.name, doseLabel: m.doseLabel, times: m.times })),
      range: { from, to },
      stats,
      evidence: {
        doses: input.doses,
        checkIns: checkIns.map((c) => ({
          id: c._id,
          at: c.at,
          state: c.state,
          painScore: c.painScore,
          notes: c.notes,
          transcript: c.transcript,
          redFlag: c.redFlag,
          trigger: c.trigger,
        })),
        events: input.events.filter((e) => e.type !== "lid_open"),
      },
      activity: input.activity,
      report: report
        ? { sections: report.sections ?? null, body: report.body, model: report.model, createdAt: report.createdAt }
        : null,
    };
  },
});

// ---------------------------------------------------------------------------
// Internal: inputs for convex/ai.ts, saving results, the 8 PM cron
// ---------------------------------------------------------------------------

export const dailyInput = internalQuery({
  args: { patientId: v.id("patients"), now: v.number() },
  handler: async (ctx, { patientId, now }) => {
    const patient = await ctx.db.get(patientId);
    if (!patient) return null;
    const { start } = localDayBounds(patient.timeZone, now);
    const stats = computeStats(await loadReportInput(ctx, patient, start, now));
    const timeline: DayTimelineItem[] = (await dayTimeline(ctx, patient, start, now)).map((e) => ({
      id: e.id,
      at: e.at,
      kind: e.kind,
      text: e.detail ? `${e.title} (${e.detail})` : e.title,
    }));
    return { firstName: firstName(patient), timeZone: patient.timeZone, stats, timeline, periodStart: start };
  },
});

export const clinicianInput = internalQuery({
  args: { patientId: v.id("patients"), from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient) return null;
    const { from, to } = clampRange(args.from, args.to);
    const stats = computeStats(await loadReportInput(ctx, patient, from, to));
    return { firstName: firstName(patient), timeZone: patient.timeZone, stats, from, to };
  },
});

export const saveSummary = internalMutation({
  args: {
    patientId: v.id("patients"),
    kind: v.union(v.literal("daily"), v.literal("clinician")),
    periodStart: v.number(),
    periodEnd: v.number(),
    body: v.string(),
    evidenceIds: v.array(v.string()),
    model: v.string(),
    sections: v.optional(v.any()),
  },
  handler: async (ctx, args) => ctx.db.insert("summaries", { ...args, createdAt: Date.now() }),
});

export const logAi = internalMutation({
  args: {
    patientId: v.id("patients"),
    job: v.string(),
    model: v.string(),
    prompt: v.string(),
    response: v.string(),
    ok: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("aiLogs", {
      ...args,
      prompt: args.prompt.slice(0, 50_000),
      response: args.response.slice(0, 20_000),
      at: Date.now(),
    });
  },
});

/** Hourly: queue the daily summary for every patient whose local time just reached 8 PM. */
export const dueDailySummaries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const patients = await ctx.db.query("patients").collect();
    for (const patient of patients) {
      if (localHour(patient.timeZone, now) !== 20) continue;
      const { start } = localDayBounds(patient.timeZone, now);
      const latest = await ctx.db
        .query("summaries")
        .withIndex("by_patient_kind", (q) => q.eq("patientId", patient._id).eq("kind", "daily"))
        .order("desc")
        .first();
      if (latest && latest.periodStart >= start) continue;
      await ctx.scheduler.runAfter(0, internal.ai.generateDailySummary, { patientId: patient._id as Id<"patients"> });
    }
  },
});
