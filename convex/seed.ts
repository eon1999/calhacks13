import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { generateDemoHistory } from "../lib/demo-history";
import { localDateKey } from "../lib/onboarding/recovery";

const TIME_ZONE = "America/Los_Angeles";
const DAY_MS = 86_400_000;
export const DEMO_OWNER = "demo-seed-sarah";
const HISTORY_DAYS = 14;

/**
 * The demo patient: Margaret, 16 days after a knee replacement, home for 14,
 * with two weeks of simulated history (lib/demo-history.ts). `isDemo` makes
 * every screen label the data as simulated.
 */
export async function createDemoPatient(ctx: MutationCtx): Promise<Id<"patients">> {
  const now = Date.now();
  const patientId = await ctx.db.insert("patients", {
    name: "Margaret Lee",
    preferredName: "Margaret",
    timeZone: TIME_ZONE,
    language: "English",
    extraPatience: false,
    ownerUserId: DEMO_OWNER,
    isDemo: true,
    recovery: {
      procedure: "knee_replacement",
      surgeryDate: localDateKey(TIME_ZONE, now - (HISTORY_DAYS + 2) * DAY_MS),
      dischargeDate: localDateKey(TIME_ZONE, now - HISTORY_DAYS * DAY_MS),
      careNotes: "Walk three times a day with the walker. Keep the dressing dry. No kneeling.",
    },
    health: {
      conditions: ["High blood pressure"],
      allergies: ["Penicillin (rash)"],
      mobility: "walker",
    },
    emergencyContacts: [{ name: "Sarah Lee", relationship: "Daughter", phone: "(555) 010-2233" }],
    consent: { status: "agreed", at: now - HISTORY_DAYS * DAY_MS },
  });

  await ctx.db.insert("careTeamMembers", {
    patientId,
    userId: DEMO_OWNER,
    role: "care_partner",
    permissions: ["alerts", "summary"],
    name: "Sarah",
    relationship: "Daughter",
    isOwner: true,
    urgentAlerts: true,
    joinedAt: now,
  });
  await ctx.db.insert("careTeamMembers", {
    patientId,
    userId: "demo-seed-maria",
    role: "caregiver",
    permissions: ["alerts"],
    name: "Maria",
    urgentAlerts: true,
    joinedAt: now,
  });
  await ctx.db.insert("careTeamMembers", {
    patientId,
    userId: "demo-seed-dr-patel",
    role: "clinician",
    permissions: ["report"],
    name: "Dr. Patel",
    relationship: "Orthopedic surgeon",
    joinedAt: now,
  });

  const meds = [
    { name: "Acetaminophen", doseLabel: "1000 mg, 2 tablets", times: ["08:00", "14:00", "20:00"] },
    { name: "Apixaban", doseLabel: "2.5 mg, 1 tablet", times: ["08:00", "20:00"] },
    { name: "Cephalexin", doseLabel: "500 mg, 1 capsule", times: ["08:00", "14:00", "20:00"] },
  ];
  const medications: { id: Id<"medications">; name: string; times: string[]; windowMinutes: number }[] = [];
  for (const m of meds) {
    const id = await ctx.db.insert("medications", { patientId, ...m, windowMinutes: 60, active: true });
    medications.push({ id, name: m.name, times: m.times, windowMinutes: 60 });
  }

  const history = generateDemoHistory({
    medications,
    timeZone: TIME_ZONE,
    now,
    days: HISTORY_DAYS,
    firstName: "Margaret",
    carePartner: "Sarah",
  });
  for (const d of history.doses) {
    await ctx.db.insert("doseEvents", { patientId, ...d, medicationId: d.medicationId as Id<"medications"> });
  }
  for (const c of history.checkIns) await ctx.db.insert("checkIns", { patientId, ...c });
  for (const e of history.events) await ctx.db.insert("events", { patientId, ...e });
  for (const a of history.alerts) await ctx.db.insert("alerts", { patientId, ...a });
  for (const a of history.activity) await ctx.db.insert("activitySamples", { patientId, deviceId: "band-01", ...a });

  return patientId;
}

// Creates the demo patient with two weeks of simulated history.
// Idempotent: returns the existing first patient if one already exists.
// /demo → "Reset demo data" rebuilds it from scratch (convex/demo.ts).
// TODO: remove or guard before any real deployment.
export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("patients").first();
    if (existing) return existing._id;
    return createDemoPatient(ctx);
  },
});
