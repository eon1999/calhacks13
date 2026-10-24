import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { maskPhone } from "../lib/notify/phone";
import { phoneConfig, placeCall } from "../lib/phone/calls";
import { planUrgentCalls } from "../lib/phone/plan";
import { urgentCallVariables } from "../lib/phone/script";

// Phone calls for urgent alerts. convex/alerts.ts raiseAlert() schedules
// callUrgent() for every new urgent care alert (a merged duplicate isn't
// called twice). The Cartesia phone agent rings the emergency contacts and
// says who it's about and what the problem is. Every attempt is logged to
// `phoneCalls`. Without the Cartesia env vars on this Convex deployment it's
// a dry run, logged as "skipped", like texts in convex/notify.ts.

const DRY_RUN = "Phone calls aren't set up yet (no Cartesia env vars on this Convex deployment)";

export const urgentCallContext = internalQuery({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, { alertId }) => {
    const alert = await ctx.db.get(alertId);
    const patient = alert ? await ctx.db.get(alert.patientId) : null;
    if (!alert || !patient) return null;
    const members = await ctx.db
      .query("careTeamMembers")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .collect();
    return { alert, patient, members };
  },
});

const callRecord = v.object({
  patientId: v.id("patients"),
  alertId: v.id("alerts"),
  memberId: v.optional(v.id("careTeamMembers")),
  name: v.string(),
  to: v.string(),
  problem: v.string(),
  status: v.union(v.literal("placed"), v.literal("failed"), v.literal("skipped")),
  reason: v.optional(v.string()),
  agentCallId: v.optional(v.string()),
});

export const recordCalls = internalMutation({
  args: { calls: v.array(callRecord) },
  handler: async (ctx, { calls }) => {
    const at = Date.now();
    for (const call of calls) await ctx.db.insert("phoneCalls", { ...call, at });
  },
});

export const callUrgent = internalAction({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, { alertId }): Promise<void> => {
    const found = await ctx.runQuery(internal.phone.urgentCallContext, { alertId });
    if (!found) return;
    const { alert, patient, members } = found;

    // With the simulator's debug test phone set (convex/debug.ts), ring only that
    // number, like texts do, so testing never phones the real emergency contacts.
    const targets = patient.testTextTo
      ? [{ name: "there", to: patient.testTextTo }]
      : planUrgentCalls(
          patient.emergencyContacts ?? [],
          members.map((m) => ({ id: m._id, name: m.name, role: m.role, phone: m.phone, urgentAlerts: m.urgentAlerts })),
        );
    if (targets.length === 0) return;

    const config = phoneConfig(process.env);
    const patientName = patient.preferredName ?? patient.name;
    const calls = await Promise.all(
      targets.map(async (t) => {
        const base = {
          patientId: patient._id,
          alertId,
          memberId: t.memberId as Id<"careTeamMembers"> | undefined,
          name: t.name,
          to: t.to,
          problem: alert.reason,
        };
        if (!config) return { ...base, status: "skipped" as const, reason: DRY_RUN };
        const variables = urgentCallVariables({ patientName, contactName: t.name, problem: alert.reason });
        const result = await placeCall(config, t.to, variables);
        if (!result.ok) {
          console.error(`[phone] call to ${maskPhone(t.to)} failed: ${result.error}`);
          return { ...base, status: "failed" as const, reason: result.error };
        }
        return { ...base, status: "placed" as const, agentCallId: result.agentCallId };
      }),
    );
    await ctx.runMutation(internal.phone.recordCalls, { calls });
  },
});
