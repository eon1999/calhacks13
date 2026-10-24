import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireManager, text } from "./onboarding";

// /settings: medication schedule, care team permissions and access.
// Adding/removing medicines and invites reuse convex/onboarding.ts and
// convex/invites.ts; devices live in convex/devices.ts.
// TODO(auth): `userId` is the client-supplied demo identity (or, on the demo
// "manage as the owner" switch, the owner's id). Use ctx.auth with Clerk.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const permission = v.union(v.literal("alerts"), v.literal("summary"), v.literal("report"));

/** Everything the settings page shows for one patient. */
export const overview = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const patient = await ctx.db.get(patientId);
    if (!patient) return null;
    const [medications, members, invites] = await Promise.all([
      ctx.db
        .query("medications")
        .withIndex("by_patient", (q) => q.eq("patientId", patientId))
        .filter((q) => q.eq(q.field("active"), true))
        .collect(),
      ctx.db
        .query("careTeamMembers")
        .withIndex("by_patient", (q) => q.eq("patientId", patientId))
        .collect(),
      ctx.db
        .query("invites")
        .withIndex("by_patient", (q) => q.eq("patientId", patientId))
        .collect(),
    ]);
    const owner = members.find((m) => m.isOwner);
    return {
      patient: {
        name: patient.name,
        preferredName: patient.preferredName,
        timeZone: patient.timeZone,
        language: patient.language,
        recovery: patient.recovery ?? null,
        health: patient.health ?? null,
        emergencyContacts: patient.emergencyContacts ?? [],
        consent: patient.consent ?? null,
      },
      // Demo only: lets the page act as the owner while there's no sign-in.
      ownerUserId: patient.ownerUserId ?? owner?.userId ?? null,
      medications: medications.sort((a, b) => a.name.localeCompare(b.name)),
      members: members.map((m) => ({
        _id: m._id,
        userId: m.userId,
        name: m.name ?? "Unnamed",
        role: m.role,
        relationship: m.relationship,
        permissions: m.permissions,
        urgentAlerts: m.urgentAlerts ?? false,
        isOwner: m.isOwner ?? false,
        joinedAt: m.joinedAt,
      })),
      pendingInvites: invites
        .filter((i) => !i.acceptedAt)
        .map((i) => ({ _id: i._id, name: i.name, role: i.role, token: i.token, expiresAt: i.expiresAt })),
    };
  },
});

/** Change a medicine's dose label, times or reminder window (as prescribed). */
export const updateMedication = mutation({
  args: {
    userId: v.string(),
    medicationId: v.id("medications"),
    doseLabel: v.optional(v.string()),
    times: v.array(v.string()),
    windowMinutes: v.number(),
  },
  handler: async (ctx, { userId, medicationId, doseLabel, times, windowMinutes }) => {
    const med = await ctx.db.get(medicationId);
    if (!med || !med.active) throw new Error("Medicine not found");
    await requireManager(ctx, med.patientId, userId);
    const cleanTimes = [...new Set(times.map((t) => t.trim()))].sort();
    if (cleanTimes.length === 0) throw new Error("Add at least one time");
    const bad = cleanTimes.find((t) => !HHMM.test(t));
    if (bad) throw new Error(`"${bad}" isn't a time like 08:00`);
    if (windowMinutes < 5 || windowMinutes > 240) throw new Error("Reminder window must be 5–240 minutes");
    await ctx.db.patch(medicationId, {
      times: cleanTimes,
      windowMinutes: Math.round(windowMinutes),
      ...(doseLabel !== undefined ? { doseLabel: text(doseLabel, "Dose") } : {}),
    });
  },
});

/** What a care-team member is told about. */
export const setPermissions = mutation({
  args: {
    userId: v.string(),
    memberId: v.id("careTeamMembers"),
    permissions: v.array(permission),
    urgentAlerts: v.boolean(),
  },
  handler: async (ctx, { userId, memberId, permissions, urgentAlerts }) => {
    const member = await ctx.db.get(memberId);
    if (!member) throw new Error("Care team member not found");
    await requireManager(ctx, member.patientId, userId);
    await ctx.db.patch(memberId, { permissions: [...new Set(permissions)], urgentAlerts });
  },
});

/** Remove someone from the care team. The owner can't be removed. */
export const revokeMember = mutation({
  args: { userId: v.string(), memberId: v.id("careTeamMembers") },
  handler: async (ctx, { userId, memberId }) => {
    const member = await ctx.db.get(memberId);
    if (!member) return;
    await requireManager(ctx, member.patientId, userId);
    if (member.isOwner) throw new Error("The person who set up Cadence can't be removed");
    await ctx.db.delete(memberId);
  },
});
