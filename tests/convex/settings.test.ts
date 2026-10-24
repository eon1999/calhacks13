// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { backend } from "./setup";

async function setup(t: ReturnType<typeof backend>) {
  return t.run(async (ctx) => {
    const patientId = await ctx.db.insert("patients", { name: "Ruth Park", timeZone: "America/Los_Angeles", ownerUserId: "dan" });
    const ownerId = await ctx.db.insert("careTeamMembers", {
      patientId, userId: "dan", role: "care_partner", permissions: ["alerts", "summary"], name: "Dan", isOwner: true,
    });
    const aideId = await ctx.db.insert("careTeamMembers", {
      patientId, userId: "maria", role: "caregiver", permissions: ["alerts"], name: "Maria",
    });
    const medicationId = await ctx.db.insert("medications", {
      patientId, name: "Acetaminophen", doseLabel: "1000 mg", times: ["08:00"], windowMinutes: 30, active: true,
    });
    return { patientId, ownerId, aideId, medicationId };
  });
}

describe("settings", () => {
  it("shows the overview with the owner's id", async () => {
    const t = backend();
    const { patientId } = await setup(t);
    const o = await t.query(api.settings.overview, { patientId });
    expect(o?.ownerUserId).toBe("dan");
    expect(o?.members).toHaveLength(2);
    expect(o?.medications.map((m) => m.name)).toEqual(["Acetaminophen"]);
  });

  it("edits a medicine's times and window, managers only", async () => {
    const t = backend();
    const { medicationId } = await setup(t);
    await t.mutation(api.settings.updateMedication, { userId: "dan", medicationId, times: ["20:00", "08:00"], windowMinutes: 45 });
    const med = await t.run((ctx) => ctx.db.get(medicationId));
    expect(med).toMatchObject({ times: ["08:00", "20:00"], windowMinutes: 45 });
    await expect(
      t.mutation(api.settings.updateMedication, { userId: "maria", medicationId, times: ["09:00"], windowMinutes: 30 }),
    ).rejects.toThrow(/Only the person/);
    await expect(
      t.mutation(api.settings.updateMedication, { userId: "dan", medicationId, times: ["9am"], windowMinutes: 30 }),
    ).rejects.toThrow(/isn't a time/);
  });

  it("changes permissions and revokes members, but never the owner", async () => {
    const t = backend();
    const { ownerId, aideId } = await setup(t);
    await t.mutation(api.settings.setPermissions, { userId: "dan", memberId: aideId, permissions: ["alerts", "summary"], urgentAlerts: false });
    expect(await t.run((ctx) => ctx.db.get(aideId))).toMatchObject({ permissions: ["alerts", "summary"], urgentAlerts: false });
    await expect(t.mutation(api.settings.revokeMember, { userId: "dan", memberId: ownerId })).rejects.toThrow(/can't be removed/);
    await t.mutation(api.settings.revokeMember, { userId: "dan", memberId: aideId });
    expect(await t.run((ctx) => ctx.db.get(aideId))).toBeNull();
  });
});
