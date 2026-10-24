import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { getsDailySummary, preferencesOf } from "../lib/notify/plan";
import { localDateKey } from "../lib/onboarding/recovery";
import { buildDaySchedule, localDayBounds } from "../lib/schedule";
import { composeDailySummary, summaryDue, type DailySummaryInput } from "../lib/summary/daily";
import { deliver, textable, type TextRecord } from "./notify";
import { membership } from "./onboarding";

// Daily recovery summary texts for the family. convex/crons.ts runs
// sendDueSummaries every 15 minutes; each member with the daily summary on
// gets one text at their own summary time (patient's time zone), at most once
// a day. Composed by rules (lib/summary/daily.ts), stored in `summaries`,
// sent and logged like alert texts (dry run without Twilio).

const DAY_MS = 86_400_000;

/** Everything that happened today, shaped for the composer, plus the ids it drew on. */
async function gatherDay(ctx: QueryCtx, patient: Doc<"patients">, now: number) {
  const patientId = patient._id;
  const { start, end } = localDayBounds(patient.timeZone, now);
  const [medications, doseEvents, checkIns, alerts, events, activity] = await Promise.all([
    ctx.db
      .query("medications")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .filter((q) => q.eq(q.field("active"), true))
      .collect(),
    ctx.db
      .query("doseEvents")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("scheduledFor", start).lt("scheduledFor", end))
      .collect(),
    ctx.db
      .query("checkIns")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("at", start).lte("at", now))
      .collect(),
    ctx.db
      .query("alerts")
      .withIndex("by_patient_status", (q) => q.eq("patientId", patientId))
      .collect()
      .then((all) => all.filter((a) => a.createdAt >= start && a.createdAt <= now)),
    ctx.db
      .query("events")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("at", start).lte("at", now))
      .collect(),
    ctx.db
      .query("activitySamples")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("windowStart", start).lte("windowStart", now))
      .collect(),
  ]);

  const slots = buildDaySchedule(
    medications.map((m) => ({ id: m._id, name: m.name, doseLabel: m.doseLabel, times: m.times, windowMinutes: m.windowMinutes })),
    doseEvents.map((e) => ({ medicationId: e.medicationId, scheduledFor: e.scheduledFor, status: e.status })),
    patient.timeZone,
    now,
  );
  const steps = activity.reduce((sum, a) => sum + a.steps, 0);
  const input: DailySummaryInput = {
    patientName: patient.preferredName ?? patient.name,
    recovery: patient.recovery,
    today: localDateKey(patient.timeZone, now),
    slots,
    checkIns: checkIns.sort((a, b) => a.at - b.at),
    alerts,
    events,
    steps: steps || undefined,
  };
  return { input, start, evidenceIds: [...checkIns, ...alerts, ...events].map((d) => d._id as string) };
}

/** Members whose summary time is now and who haven't had today's summary yet. */
export const dueSummaries = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const work: { patientId: Id<"patients">; memberIds: Id<"careTeamMembers">[] }[] = [];
    for (const patient of await ctx.db.query("patients").collect()) {
      const members = await ctx.db
        .query("careTeamMembers")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .collect();
      const due = members.filter(
        (m) => getsDailySummary(textable(m)) && summaryDue(preferencesOf(textable(m)).summaryTime, patient.timeZone, now),
      );
      if (due.length === 0) continue;
      const { start } = localDayBounds(patient.timeZone, now);
      const sentToday = new Set(
        (
          await ctx.db
            .query("textMessages")
            .withIndex("by_patient_time", (q) => q.eq("patientId", patient._id).gte("at", start))
            .collect()
        )
          .filter((t) => t.summaryId && t.memberId)
          .map((t) => t.memberId as string),
      );
      const memberIds = due.filter((m) => !sentToday.has(m._id)).map((m) => m._id);
      if (memberIds.length) work.push({ patientId: patient._id, memberIds });
    }
    return work;
  },
});

/** Compose today's summary, store it, and return one text per member (with their own held quiet-hours items). */
export const prepareSummary = internalMutation({
  args: { patientId: v.id("patients"), memberIds: v.array(v.id("careTeamMembers")), now: v.number() },
  handler: async (ctx, { patientId, memberIds, now }) => {
    const patient = await ctx.db.get(patientId);
    if (!patient) return null;
    const { input, start, evidenceIds } = await gatherDay(ctx, patient, now);
    const preview = composeDailySummary(input);
    const summaryId = await ctx.db.insert("summaries", {
      patientId,
      kind: "daily",
      periodStart: start,
      periodEnd: now,
      body: preview,
      evidenceIds,
      model: "rules",
      createdAt: now,
    });

    const recent = await ctx.db
      .query("textMessages")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId).gte("at", now - DAY_MS))
      .collect();
    const texts: { memberId: Id<"careTeamMembers">; to: string; body: string }[] = [];
    for (const memberId of memberIds) {
      const member = await ctx.db.get(memberId);
      if (!member?.phone) continue;
      const mine = recent.filter((t) => t.memberId === memberId);
      const lastSummary = Math.max(0, ...mine.filter((t) => t.summaryId).map((t) => t.at));
      const held = mine.filter((t) => t.heldForSummary && t.at > lastSummary).map((t) => ({ reason: t.body }));
      texts.push({ memberId, to: member.phone, body: composeDailySummary({ ...input, held: heldReasons(held) }) });
    }
    return { summaryId, preview, texts };
  },
});

/** Held alert texts read "Cadence · Heads-up for Margaret (11:40 PM): <reason> Reply STOP…"; keep just the reason. */
function heldReasons(held: { reason: string }[]): { reason: string }[] {
  return held.map(({ reason }) => ({
    reason: reason.replace(/^Cadence · [^:]+\): /, "").replace(/ Reply STOP to opt out\.$/, ""),
  }));
}

async function sendPrepared(
  prepared: { summaryId: Id<"summaries">; texts: { memberId: Id<"careTeamMembers">; to: string; body: string }[] },
  patientId: Id<"patients">,
): Promise<TextRecord[]> {
  return Promise.all(
    prepared.texts.map((t) => deliver({ patientId, summaryId: prepared.summaryId, memberId: t.memberId, to: t.to, body: t.body })),
  );
}

/** Cron entry point (convex/crons.ts). */
export const sendDueSummaries = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const now = Date.now();
    const work = await ctx.runQuery(internal.summary.dueSummaries, { now });
    for (const { patientId, memberIds } of work) {
      const prepared = await ctx.runMutation(internal.summary.prepareSummary, { patientId, memberIds, now });
      if (!prepared || prepared.texts.length === 0) continue;
      const texts = await sendPrepared(prepared, patientId);
      await ctx.runMutation(internal.notify.recordTexts, { texts });
    }
  },
});

export const summaryRecipients = internalQuery({
  args: { userId: v.string(), patientId: v.id("patients") },
  handler: async (ctx, { userId, patientId }) => {
    if (!(await membership(ctx, patientId, userId))) return null;
    const members = await ctx.db
      .query("careTeamMembers")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect();
    return members.filter((m) => getsDailySummary(textable(m))).map((m) => m._id);
  },
});

/** "Send today's summary now" on the hub: everyone who gets the daily summary, ignoring their time and the once-a-day limit. */
export const sendSummaryNow = action({
  args: { userId: v.string(), patientId: v.id("patients") },
  handler: async (ctx, { userId, patientId }): Promise<{ preview: string; sent: number; dryRun: boolean }> => {
    const memberIds = await ctx.runQuery(internal.summary.summaryRecipients, { userId, patientId });
    if (memberIds === null) throw new Error("Only the patient's care team can send the summary");
    const prepared = await ctx.runMutation(internal.summary.prepareSummary, { patientId, memberIds, now: Date.now() });
    if (!prepared) throw new Error("Patient not found");
    const texts = await sendPrepared(prepared, patientId);
    if (texts.length) await ctx.runMutation(internal.notify.recordTexts, { texts });
    return {
      preview: prepared.preview,
      sent: texts.filter((t) => t.status === "sent").length,
      dryRun: texts.some((t) => t.status === "skipped"),
    };
  },
});
