import { mutation } from "./_generated/server";
import { localDateKey } from "../lib/onboarding/recovery";

const TIME_ZONE = "America/Los_Angeles";
const DAY_MS = 86_400_000;

// Creates a demo patient three days after a knee replacement, with a typical
// post-op schedule and a small care team.
// Idempotent: returns the existing first patient if one already exists.
// TODO: remove or guard before any real deployment.
export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("patients").first();
    if (existing) return existing._id;

    const now = Date.now();
    const patientId = await ctx.db.insert("patients", {
      name: "Margaret Lee",
      preferredName: "Margaret",
      timeZone: TIME_ZONE,
      language: "English",
      extraPatience: false,
      ownerUserId: "demo-seed-sarah",
      recovery: {
        procedure: "knee_replacement",
        surgeryDate: localDateKey(TIME_ZONE, now - 3 * DAY_MS),
        dischargeDate: localDateKey(TIME_ZONE, now - DAY_MS),
        careNotes: "Walk three times a day with the walker. Keep the dressing dry. No kneeling.",
      },
    });

    await ctx.db.insert("careTeamMembers", {
      patientId,
      userId: "demo-seed-sarah",
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

    await ctx.db.insert("medications", {
      patientId,
      name: "Acetaminophen",
      doseLabel: "1000 mg, 2 tablets",
      times: ["08:00", "14:00", "20:00"],
      windowMinutes: 60,
      active: true,
    });
    await ctx.db.insert("medications", {
      patientId,
      name: "Apixaban",
      doseLabel: "2.5 mg, 1 tablet",
      times: ["08:00", "20:00"],
      windowMinutes: 60,
      active: true,
    });
    await ctx.db.insert("medications", {
      patientId,
      name: "Cephalexin",
      doseLabel: "500 mg, 1 capsule",
      times: ["08:00", "14:00", "20:00"],
      windowMinutes: 60,
      active: true,
    });

    return patientId;
  },
});
