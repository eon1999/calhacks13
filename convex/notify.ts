import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { maskPhone } from "../lib/notify/phone";
import { alertTextBody, planTexts, type TextableMember } from "../lib/notify/plan";
import { sendSms, twilioConfig } from "../lib/notify/twilio";
import { formatLocalTime } from "../lib/schedule";
import { membership, optionalPhone } from "./onboarding";

// Text alerts. Every alert row goes through openAlert(), which schedules
// textAlert() to run right after the mutation commits: it works out who to
// text (lib/notify/plan.ts), sends through Twilio, and logs each attempt to
// `textMessages`. Without Twilio env vars it's a dry run: texts are logged
// as "skipped" so the hub still shows what would have gone out.
// TODO(auth): `userId` is the demo identity; see convex/onboarding.ts.

const RECENT_TEXTS = 8;
const DRY_RUN = "Texting isn't set up yet (no Twilio env vars on this Convex deployment)";

type AlertTier = Doc<"alerts">["tier"];

/** Insert an alert and text the care team about it. Use this instead of inserting into `alerts` directly. */
export async function openAlert(
  ctx: MutationCtx,
  { patientId, tier, reason }: { patientId: Id<"patients">; tier: AlertTier; reason: string },
): Promise<Id<"alerts">> {
  const alertId = await ctx.db.insert("alerts", {
    patientId,
    tier,
    reason,
    createdAt: Date.now(),
    status: "open",
  });
  await ctx.scheduler.runAfter(0, internal.notify.textAlert, { alertId });
  return alertId;
}

function textable(m: Doc<"careTeamMembers">): TextableMember {
  return {
    id: m._id,
    name: m.name ?? "Care team member",
    role: m.role,
    permissions: m.permissions,
    phone: m.phone,
    isOwner: m.isOwner,
    urgentAlerts: m.urgentAlerts,
  };
}

const textRecord = v.object({
  patientId: v.id("patients"),
  alertId: v.optional(v.id("alerts")),
  memberId: v.optional(v.id("careTeamMembers")),
  to: v.string(),
  body: v.string(),
  status: v.union(v.literal("sent"), v.literal("failed"), v.literal("skipped")),
  reason: v.optional(v.string()),
  providerId: v.optional(v.string()),
});
type TextRecord = Infer<typeof textRecord>;

export const alertTextContext = internalQuery({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, { alertId }) => {
    const alert = await ctx.db.get(alertId);
    const patient = alert ? await ctx.db.get(alert.patientId) : null;
    if (!alert || !patient) return null;
    const members = await ctx.db
      .query("careTeamMembers")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .collect();
    const recent = await ctx.db
      .query("textMessages")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patient._id).gte("at", alert.createdAt - 60 * 60 * 1000))
      .collect();
    return { alert, patient, members, recent };
  },
});

export const recordTexts = internalMutation({
  args: { texts: v.array(textRecord) },
  handler: async (ctx, { texts }) => {
    const at = Date.now();
    for (const text of texts) await ctx.db.insert("textMessages", { ...text, at });
  },
});

/** Send one text, or log it as a dry run when Twilio isn't configured. */
async function deliver(base: Omit<TextRecord, "status" | "reason" | "providerId">): Promise<TextRecord> {
  const config = twilioConfig(process.env);
  if (!config) return { ...base, status: "skipped", reason: DRY_RUN };
  const result = await sendSms(config, base.to, base.body);
  if (!result.ok) console.error(`[notify] text to ${maskPhone(base.to)} failed: ${result.error}`);
  const trialNote = config.trialTemplate
    ? `Twilio trial: sent its "${config.trialTemplate}" template in place of this text`
    : undefined;
  return result.ok
    ? { ...base, status: "sent", providerId: result.sid, reason: trialNote }
    : { ...base, status: "failed", reason: result.error };
}

export const textAlert = internalAction({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, { alertId }): Promise<void> => {
    const found = await ctx.runQuery(internal.notify.alertTextContext, { alertId });
    if (!found) return;
    const { alert, patient, members, recent } = found;

    const plan = planTexts(alert.tier, members.map(textable), recent, Date.now(), patient.testTextTo);
    if (plan.length === 0) return;

    const name = patient.preferredName ?? patient.name;
    const body = alertTextBody(alert.tier, name, formatLocalTime(patient.timeZone, alert.createdAt), alert.reason);
    const texts = await Promise.all(
      plan.map((p) => {
        const base = {
          patientId: patient._id,
          alertId,
          memberId: p.memberId as Id<"careTeamMembers"> | undefined,
          to: p.to,
          body,
        };
        return p.skip ? Promise.resolve<TextRecord>({ ...base, status: "skipped", reason: p.skip }) : deliver(base);
      }),
    );
    await ctx.runMutation(internal.notify.recordTexts, { texts });
  },
});

/** The hub's "Text alerts" card: who gets texts for this patient, and what went out recently. */
export const overview = query({
  args: { userId: v.string(), patientId: v.id("patients") },
  handler: async (ctx, { userId, patientId }) => {
    const me = await membership(ctx, patientId, userId);
    if (!me) return null;
    const canManage = !!me.isOwner || me.role === "patient";

    const members = await ctx.db
      .query("careTeamMembers")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .collect();
    const names = new Map(members.map((m) => [m._id as string, m.name ?? "Care team member"]));
    const recipients = members
      .filter((m) => m.permissions.includes("alerts") && m.role !== "clinician" && m.role !== "patient")
      .map((m) => ({
        memberId: m._id,
        name: m.name ?? "Care team member",
        relationship: m.relationship,
        role: m.role,
        isMe: m._id === me._id,
        canEdit: canManage || m._id === me._id,
        phone: m.phone ? maskPhone(m.phone) : null,
        urgentAlerts: m.urgentAlerts ?? false,
      }));

    const recent = await ctx.db
      .query("textMessages")
      .withIndex("by_patient_time", (q) => q.eq("patientId", patientId))
      .order("desc")
      .take(RECENT_TEXTS);

    const patient = await ctx.db.get(patientId);
    return {
      live: twilioConfig(process.env) !== null,
      testTextTo: patient?.testTextTo ? maskPhone(patient.testTextTo) : null,
      recipients,
      recent: recent.map((t) => ({
        id: t._id,
        to: maskPhone(t.to),
        name: t.memberId ? (names.get(t.memberId) ?? null) : null,
        body: t.body,
        status: t.status,
        reason: t.reason,
        at: t.at,
        test: !t.alertId,
      })),
    };
  },
});

/** Set or clear (empty string) a member's alert number. The owner or patient can set anyone's; others only their own. */
export const setMemberPhone = mutation({
  args: { userId: v.string(), memberId: v.id("careTeamMembers"), phone: v.string() },
  handler: async (ctx, { userId, memberId, phone }) => {
    const target = await ctx.db.get(memberId);
    if (!target) throw new Error("That person isn't on the care team anymore");
    const me = await membership(ctx, target.patientId, userId);
    if (!me || !(me.isOwner || me.role === "patient" || me._id === target._id)) {
      throw new Error("Only the person who set up Cadence, or the patient, can change someone else's number");
    }
    await ctx.db.patch(memberId, { phone: optionalPhone(phone) });
  },
});

export const testTextContext = internalQuery({
  args: { userId: v.string(), memberId: v.id("careTeamMembers") },
  handler: async (ctx, { userId, memberId }) => {
    const target = await ctx.db.get(memberId);
    const patient = target ? await ctx.db.get(target.patientId) : null;
    const me = target ? await membership(ctx, target.patientId, userId) : null;
    if (!target || !patient || !me) return null;
    return { target, patient };
  },
});

/** "Send test" on the hub: one text to one member, so a family can check the number before it matters. */
export const sendTestText = action({
  args: { userId: v.string(), memberId: v.id("careTeamMembers") },
  handler: async (ctx, { userId, memberId }): Promise<{ status: TextRecord["status"]; reason?: string }> => {
    const found = await ctx.runQuery(internal.notify.testTextContext, { userId, memberId });
    if (!found) throw new Error("That person isn't on this care team");
    const { target, patient } = found;
    if (!target.phone) throw new Error(`Add a mobile number for ${target.name ?? "them"} first`);

    const name = patient.preferredName ?? patient.name;
    const text = await deliver({
      patientId: patient._id,
      memberId,
      to: target.phone,
      body: `Cadence: this is a test. You'll get texts here if ${name} needs a hand. Reply STOP to opt out.`,
    });
    await ctx.runMutation(internal.notify.recordTexts, { texts: [text] });
    return { status: text.status, reason: text.reason };
  },
});
