import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveOptionalUserId, resolveUserId } from "./identity";
import { ROLES } from "../lib/onboarding/roles";
import { membership, requireManager } from "./onboarding";

// Invite links: the owner or patient picks a role and a name, shares the
// link, and the invitee joins the care team from /join/[token].
// `userId` is resolved to the signed-in Clerk user when there is one (convex/identity.ts).

const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

const careRole = v.union(
  v.literal("care_partner"),
  v.literal("caregiver"),
  v.literal("clinician"),
  v.literal("patient"),
);

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const create = mutation({
  args: {
    userId: v.string(),
    patientId: v.id("patients"),
    role: careRole,
    name: v.string(),
    contact: v.optional(v.string()),
  },
  handler: async (ctx, { userId: claimed, patientId, role, name, contact }) => {
    await requireManager(ctx, patientId, claimed);
    const userId = await resolveUserId(ctx, claimed);
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 200) throw new Error("Enter a name for the person you're inviting");
    const now = Date.now();
    const token = newToken();
    await ctx.db.insert("invites", {
      patientId,
      token,
      role,
      name: cleanName,
      contact: contact?.trim() || undefined,
      invitedBy: userId,
      createdAt: now,
      expiresAt: now + INVITE_TTL_MS,
    });
    return token;
  },
});

export const revoke = mutation({
  args: { userId: v.string(), inviteId: v.id("invites") },
  handler: async (ctx, { userId, inviteId }) => {
    const invite = await ctx.db.get(inviteId);
    if (!invite || invite.acceptedAt) return;
    await requireManager(ctx, invite.patientId, userId);
    await ctx.db.delete(inviteId);
  },
});

/** What the invite page shows before someone accepts. */
export const get = query({
  args: { token: v.string(), userId: v.optional(v.string()), now: v.number() },
  handler: async (ctx, { token, userId: claimed, now }) => {
    const userId = await resolveOptionalUserId(ctx, claimed);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!invite) return null;
    const patient = await ctx.db.get(invite.patientId);
    if (!patient) return null;

    const inviter = await membership(ctx, invite.patientId, invite.invitedBy);
    const acceptedByMe = !!userId && invite.acceptedUserId === userId;
    // e.g. the owner opening their own invite link on the same browser.
    const mine = userId && !acceptedByMe ? await membership(ctx, invite.patientId, userId) : null;
    const status = acceptedByMe
      ? "joined"
      : invite.acceptedAt
        ? "used"
        : invite.expiresAt < now
          ? "expired"
          : "open";

    return {
      status,
      role: invite.role,
      name: invite.name,
      patientId: invite.patientId,
      patientName: patient.preferredName ?? patient.name,
      inviterName: inviter?.name ?? "Someone",
      inviterRelationship: inviter?.relationship,
      alreadyMemberAs: mine ? { name: mine.name ?? "", role: mine.role } : null,
      recovery: patient.recovery,
      timeZone: patient.timeZone,
    } as const;
  },
});

export const accept = mutation({
  args: { token: v.string(), userId: v.string(), name: v.string() },
  handler: async (ctx, { token, userId: claimed, name }) => {
    const userId = await resolveUserId(ctx, claimed);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!invite) throw new Error("This invite link isn't valid");
    if (invite.acceptedUserId === userId) return { patientId: invite.patientId, role: invite.role };
    if (invite.acceptedAt) throw new Error("This invite has already been used");
    if (invite.expiresAt < Date.now()) throw new Error("This invite has expired. Ask for a new link.");

    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 200) throw new Error("Enter your name");

    const now = Date.now();
    const existing = await membership(ctx, invite.patientId, userId);
    if (!existing) {
      const role = ROLES[invite.role];
      await ctx.db.insert("careTeamMembers", {
        patientId: invite.patientId,
        userId,
        role: invite.role,
        permissions: role.permissions,
        name: cleanName,
        urgentAlerts: role.urgentByDefault,
        joinedAt: now,
      });
    }
    await ctx.db.patch(invite._id, { acceptedAt: now, acceptedUserId: userId });
    return { patientId: invite.patientId, role: invite.role };
  },
});
