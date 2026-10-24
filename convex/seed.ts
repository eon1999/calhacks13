import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { localDateKey } from "../lib/onboarding/recovery";
import { ROLES } from "../lib/onboarding/roles";
import { localTimeToday } from "../lib/schedule";

const TIME_ZONE = "America/Los_Angeles";
const DAY_MS = 86_400_000;
const DEMO_USER_PREFIX = "demo-seed-";

// Creates a demo patient three days after a knee replacement, with a typical
// post-op schedule, a small care team (Sarah, Maria and Dr. Patel; /care and
// /settings can "view as" them), and two days at home of doses and check-ins
// so the clinician report and daily summary have something to show.
// Phones are fictional 555-01xx numbers, so texts stay a dry run in practice.
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
        dischargeDate: localDateKey(TIME_ZONE, now - 2 * DAY_MS),
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
      phone: "+14155550101",
      joinedAt: now,
    });
    await ctx.db.insert("careTeamMembers", {
      patientId,
      userId: "demo-seed-maria",
      role: "caregiver",
      permissions: ["alerts"],
      name: "Maria",
      urgentAlerts: true,
      phone: "+14155550102",
      joinedAt: now,
    });
    await ctx.db.insert("careTeamMembers", {
      patientId,
      userId: "demo-seed-patel",
      role: "clinician",
      permissions: ["report", "summary"],
      name: "Dr. Patel",
      relationship: "Orthopedic surgeon",
      urgentAlerts: false,
      joinedAt: now,
    });

    const acetaminophen = await ctx.db.insert("medications", {
      patientId,
      name: "Acetaminophen",
      doseLabel: "1000 mg, 2 tablets",
      times: ["08:00", "14:00", "20:00"],
      windowMinutes: 60,
      active: true,
    });
    const apixaban = await ctx.db.insert("medications", {
      patientId,
      name: "Apixaban",
      doseLabel: "2.5 mg, 1 tablet",
      times: ["08:00", "20:00"],
      windowMinutes: 60,
      active: true,
    });
    const cephalexin = await ctx.db.insert("medications", {
      patientId,
      name: "Cephalexin",
      doseLabel: "500 mg, 1 capsule",
      times: ["08:00", "14:00", "20:00"],
      windowMinutes: 60,
      active: true,
    });

    await seedHistory(ctx, patientId, now, [
      { id: acetaminophen, times: ["08:00", "14:00", "20:00"] },
      { id: apixaban, times: ["08:00", "20:00"] },
      { id: cephalexin, times: ["08:00", "14:00", "20:00"] },
    ]);
    return patientId;
  },
});

// The two days since discharge: one missed evening dose, pain easing, one wound red flag.
async function seedHistory(
  ctx: MutationCtx,
  patientId: Id<"patients">,
  now: number,
  meds: { id: Id<"medications">; times: string[] }[],
) {
  for (const daysAgo of [2, 1]) {
    const day = now - daysAgo * DAY_MS;
    for (const med of meds) {
      for (const time of med.times) {
        const scheduledFor = localTimeToday(TIME_ZONE, time, day);
        if (daysAgo === 2 && time === "20:00" && med.id === meds[1].id) continue; // missed Apixaban
        await ctx.db.insert("doseEvents", {
          patientId,
          medicationId: med.id,
          scheduledFor,
          status: "taken",
          confirmedAt: scheduledFor + 10 * 60_000,
          source: "voice",
        });
      }
    }
  }
  const checkIns = [
    { daysAgo: 2, time: "11:00", state: "sore_but_managing", painScore: 7, notes: "Knee aching after the walk" },
    { daysAgo: 2, time: "18:45", state: "sore_but_managing", painScore: 6 },
    { daysAgo: 1, time: "11:00", state: "struggling", painScore: 6, notes: "Wound a little red at the edges", redFlag: true },
    { daysAgo: 1, time: "15:15", state: "sore_but_managing", painScore: 5 },
    { daysAgo: 1, time: "18:45", state: "doing_well", painScore: 4 },
  ] as const;
  for (const c of checkIns) {
    await ctx.db.insert("checkIns", {
      patientId,
      at: localTimeToday(TIME_ZONE, c.time, now - c.daysAgo * DAY_MS),
      trigger: "scheduled",
      transcript: "(seeded demo history)",
      state: c.state,
      painScore: c.painScore,
      notes: "notes" in c ? c.notes : undefined,
      redFlag: "redFlag" in c ? c.redFlag : false,
    });
  }
}

/** The seeded demo team, so a tester can look at /care, /settings and the report as Sarah, Maria or the doctor. */
export const demoMembers = query({
  args: {},
  handler: async (ctx) => {
    const members = (await ctx.db.query("careTeamMembers").collect()).filter((m) => m.userId.startsWith(DEMO_USER_PREFIX));
    return members.map((m) => ({ userId: m.userId, name: m.name ?? "Demo member", role: m.role, title: ROLES[m.role].title }));
  },
});
