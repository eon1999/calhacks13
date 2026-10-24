import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { cleanList, insertMedication, optionalText, text } from "./onboarding";

// Patient profile editor on the /hub demo page: conditions, medicines and
// emergency contacts for whichever patient the simulated band is talking to.
// TODO(auth): like convex/voice.ts these are public and unauthenticated. Gate
// them (or route the demo through convex/onboarding.ts) before real use.

export const MAX_CONTACTS = 5;
const PHONE = /^[+()\-.\s\d]{7,20}$/;

export const get = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const patient = await ctx.db.get(patientId);
    if (!patient) return null;
    const medications = await ctx.db
      .query("medications")
      .withIndex("by_patient", (q) => q.eq("patientId", patientId))
      .filter((q) => q.eq(q.field("active"), true))
      .collect();
    return {
      name: patient.preferredName ?? patient.name.split(" ")[0],
      conditions: patient.health?.conditions ?? [],
      emergencyContacts: patient.emergencyContacts ?? [],
      medications,
    };
  },
});

export const setConditions = mutation({
  args: { patientId: v.id("patients"), conditions: v.array(v.string()) },
  handler: async (ctx, { patientId, conditions }) => {
    const patient = await ctx.db.get(patientId);
    if (!patient) throw new Error("Patient not found");
    await ctx.db.patch(patientId, {
      health: { allergies: [], ...patient.health, conditions: cleanList(conditions, "Conditions") },
    });
  },
});

export const addMedication = mutation({
  args: {
    patientId: v.id("patients"),
    name: v.string(),
    doseLabel: v.string(),
    times: v.array(v.string()),
    windowMinutes: v.optional(v.number()),
  },
  handler: async (ctx, { patientId, ...med }) => {
    if (!(await ctx.db.get(patientId))) throw new Error("Patient not found");
    return insertMedication(ctx, patientId, med);
  },
});

export const removeMedication = mutation({
  args: { medicationId: v.id("medications") },
  handler: async (ctx, { medicationId }) => {
    // Soft delete so past dose events keep their medication.
    if (await ctx.db.get(medicationId)) await ctx.db.patch(medicationId, { active: false });
  },
});

export const setEmergencyContacts = mutation({
  args: {
    patientId: v.id("patients"),
    contacts: v.array(v.object({ name: v.string(), relationship: v.optional(v.string()), phone: v.string() })),
  },
  handler: async (ctx, { patientId, contacts }) => {
    if (!(await ctx.db.get(patientId))) throw new Error("Patient not found");
    if (contacts.length > MAX_CONTACTS) throw new Error(`Add up to ${MAX_CONTACTS} emergency contacts`);
    await ctx.db.patch(patientId, {
      emergencyContacts: contacts.map((c) => {
        const phone = c.phone.trim();
        if (!PHONE.test(phone) || phone.replace(/\D/g, "").length < 7) {
          throw new Error(`"${phone}" doesn't look like a phone number`);
        }
        return {
          name: text(c.name, "Contact name"),
          relationship: optionalText(c.relationship, "Relationship"),
          phone,
        };
      }),
    });
  },
});
