import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { MAX_HEALTH_ITEMS, mobilityId } from "../lib/onboarding/health";
import { resolveUserId } from "./identity";

// Family-led onboarding: the owner creates the patient, adds meds, pairs the
// band (convex/pairing.ts) and invites the care team (convex/invites.ts).
// `userId` is the client's identity; convex/identity.ts replaces it with the
// Clerk user when the caller is signed in.

const MAX_TEXT = 200;
const MAX_NOTES = 1000;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const recoveryInput = v.object({
  procedure: v.string(),
  procedureOther: v.optional(v.string()),
  surgeryDate: v.string(),
  dischargeDate: v.optional(v.string()),
  careNotes: v.optional(v.string()),
});

const patientInput = {
  name: v.string(),
  preferredName: v.optional(v.string()),
  timeZone: v.string(),
  language: v.optional(v.string()),
  extraPatience: v.optional(v.boolean()),
  recovery: recoveryInput,
};

export function text(value: string, field: string, max = MAX_TEXT): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  if (trimmed.length > max) throw new Error(`${field} is too long`);
  return trimmed;
}

export function optionalText(value: string | undefined, field: string, max = MAX_TEXT): string | undefined {
  return value?.trim() ? text(value, field, max) : undefined;
}

function validTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    throw new Error(`Unknown time zone "${timeZone}"`);
  }
}

function cleanPatient(args: {
  name: string;
  preferredName?: string;
  timeZone: string;
  language?: string;
  extraPatience?: boolean;
  recovery: Infer<typeof recoveryInput>;
}) {
  const { recovery } = args;
  if (!DATE.test(recovery.surgeryDate)) throw new Error("Surgery date must be YYYY-MM-DD");
  if (recovery.dischargeDate && !DATE.test(recovery.dischargeDate)) {
    throw new Error("Discharge date must be YYYY-MM-DD");
  }
  return {
    name: text(args.name, "Name"),
    preferredName: optionalText(args.preferredName, "Preferred name"),
    timeZone: validTimeZone(args.timeZone),
    language: optionalText(args.language, "Language"),
    extraPatience: args.extraPatience ?? false,
    recovery: {
      procedure: text(recovery.procedure, "Procedure"),
      procedureOther: optionalText(recovery.procedureOther, "Procedure name"),
      surgeryDate: recovery.surgeryDate,
      dischargeDate: recovery.dischargeDate || undefined,
      careNotes: optionalText(recovery.careNotes, "Care notes", MAX_NOTES),
    },
  };
}

/** The caller's membership on this patient's care team, or null. */
export async function membership(
  ctx: QueryCtx,
  patientId: Id<"patients">,
  claimedUserId: string,
): Promise<Doc<"careTeamMembers"> | null> {
  const userId = await resolveUserId(ctx, claimedUserId);
  const members = await ctx.db
    .query("careTeamMembers")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .collect();
  return members.find((m) => m.userId === userId) ?? null;
}

/** Only the owner (and the patient themself) may change setup or invite people. */
export async function requireManager(
  ctx: QueryCtx,
  patientId: Id<"patients">,
  userId: string,
): Promise<Doc<"careTeamMembers">> {
  const member = await membership(ctx, patientId, userId);
  if (!member || !(member.isOwner || member.role === "patient")) {
    throw new Error("Only the person who set up Cadence, or the patient, can do that");
  }
  return member;
}

export const createPatient = mutation({
  args: {
    userId: v.string(),
    ownerName: v.string(),
    relationship: v.optional(v.string()),
    ...patientInput,
  },
  handler: async (ctx, { userId: claimed, ownerName, relationship, ...patient }) => {
    const userId = await resolveUserId(ctx, claimed);
    const patientId = await ctx.db.insert("patients", {
      ...cleanPatient(patient),
      ownerUserId: text(userId, "User"),
    });
    await ctx.db.insert("careTeamMembers", {
      patientId,
      userId,
      role: "care_partner",
      permissions: ["alerts", "summary"],
      name: text(ownerName, "Your name"),
      relationship: optionalText(relationship, "Relationship"),
      isOwner: true,
      urgentAlerts: true,
      joinedAt: Date.now(),
    });
    return patientId;
  },
});

export const updatePatient = mutation({
  args: {
    userId: v.string(),
    patientId: v.id("patients"),
    ownerName: v.string(),
    relationship: v.optional(v.string()),
    ...patientInput,
  },
  handler: async (ctx, { userId, patientId, ownerName, relationship, ...patient }) => {
    const member = await requireManager(ctx, patientId, userId);
    await ctx.db.patch(patientId, cleanPatient(patient));
    await ctx.db.patch(member._id, {
      name: text(ownerName, "Your name"),
      relationship: optionalText(relationship, "Relationship"),
    });
  },
});

export const healthInput = v.object({
  conditions: v.array(v.string()),
  allergies: v.array(v.string()),
  noKnownAllergies: v.optional(v.boolean()),
  mobility: v.optional(v.string()),
  notes: v.optional(v.string()),
});

/** Trimmed, de-duplicated (case-insensitive) list of short entries. */
export function cleanList(items: string[], field: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    out.push(text(trimmed, field, 100));
  }
  if (out.length > MAX_HEALTH_ITEMS) throw new Error(`Too many ${field.toLowerCase()} entries`);
  return out;
}

export const updateHealth = mutation({
  args: { userId: v.string(), patientId: v.id("patients"), health: healthInput },
  handler: async (ctx, { userId, patientId, health }) => {
    await requireManager(ctx, patientId, userId);
    if (health.mobility && !mobilityId.safeParse(health.mobility).success) {
      throw new Error(`Unknown mobility "${health.mobility}"`);
    }
    const noKnownAllergies = health.noKnownAllergies ?? false;
    await ctx.db.patch(patientId, {
      health: {
        conditions: cleanList(health.conditions, "Conditions"),
        allergies: noKnownAllergies ? [] : cleanList(health.allergies, "Allergies"),
        noKnownAllergies,
        mobility: health.mobility || undefined,
        notes: optionalText(health.notes, "Health notes", MAX_NOTES),
      },
    });
  },
});

export const addMedication = mutation({
  args: {
    userId: v.string(),
    patientId: v.id("patients"),
    name: v.string(),
    doseLabel: v.string(),
    times: v.array(v.string()),
    windowMinutes: v.optional(v.number()),
  },
  handler: async (ctx, { userId, patientId, ...med }) => {
    await requireManager(ctx, patientId, userId);
    return insertMedication(ctx, patientId, med);
  },
});

/** Validates and schedules a medicine. Shared with the demo profile editor (convex/profile.ts). */
export async function insertMedication(
  ctx: MutationCtx,
  patientId: Id<"patients">,
  { name, doseLabel, times, windowMinutes }: { name: string; doseLabel: string; times: string[]; windowMinutes?: number },
) {
  const cleanTimes = [...new Set(times.map((t) => t.trim()))].sort();
  if (cleanTimes.length === 0) throw new Error("Add at least one time");
  const bad = cleanTimes.find((t) => !HHMM.test(t));
  if (bad) throw new Error(`"${bad}" isn't a time like 08:00`);
  const window = windowMinutes ?? 60;
  if (window < 5 || window > 240) throw new Error("Reminder window must be 5–240 minutes");

  return ctx.db.insert("medications", {
    patientId,
    name: text(name, "Medicine name"),
    doseLabel: text(doseLabel, "Dose"),
    times: cleanTimes,
    windowMinutes: window,
    active: true,
  });
}

export const removeMedication = mutation({
  args: { userId: v.string(), medicationId: v.id("medications") },
  handler: async (ctx, { userId, medicationId }) => {
    const med = await ctx.db.get(medicationId);
    if (!med) return;
    await requireManager(ctx, med.patientId, userId);
    // Soft delete so past dose events keep their medication.
    await ctx.db.patch(medicationId, { active: false });
  },
});

/** Everything the setup wizard shows, for a member of this patient's team. */
export const setup = query({
  args: { userId: v.string(), patientId: v.id("patients") },
  handler: async (ctx, { userId, patientId }) => {
    const patient = await ctx.db.get(patientId);
    const me = patient ? await membership(ctx, patientId, userId) : null;
    if (!patient || !me) return null;

    const [medications, members, invites, devices] = await Promise.all([
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
      ctx.db
        .query("devices")
        .filter((q) => q.eq(q.field("patientId"), patientId))
        .collect(),
    ]);

    return {
      patient,
      me,
      medications,
      members: members.map((m) => ({
        _id: m._id,
        name: m.name ?? "Unnamed",
        role: m.role,
        relationship: m.relationship,
        isOwner: m.isOwner ?? false,
      })),
      pendingInvites: invites
        .filter((i) => !i.acceptedAt)
        .map((i) => ({ _id: i._id, name: i.name, role: i.role, token: i.token, expiresAt: i.expiresAt })),
      devices: devices.map((d) => ({ _id: d._id, deviceId: d.deviceId, kind: d.kind })),
    };
  },
});
