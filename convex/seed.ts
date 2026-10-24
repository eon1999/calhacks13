import { mutation } from "./_generated/server";

// Creates a demo patient with a Parkinson's-style medication schedule.
// Idempotent: returns the existing first patient if one already exists.
// TODO: remove or guard before any real deployment.
export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("patients").first();
    if (existing) return existing._id;

    const patientId = await ctx.db.insert("patients", {
      name: "Margaret",
      timeZone: "America/Los_Angeles",
    });

    await ctx.db.insert("medications", {
      patientId,
      name: "Carbidopa/Levodopa",
      doseLabel: "25/100 mg, 1 tablet",
      times: ["08:00", "12:00", "16:00", "20:00"],
      windowMinutes: 30,
      active: true,
    });
    await ctx.db.insert("medications", {
      patientId,
      name: "Rasagiline",
      doseLabel: "1 mg, 1 tablet",
      times: ["08:00"],
      windowMinutes: 60,
      active: true,
    });

    return patientId;
  },
});
