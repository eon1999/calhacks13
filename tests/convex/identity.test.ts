// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { backend } from "./setup";

const recovery = { procedure: "knee_replacement", surgeryDate: "2026-10-20" };
const patient = { name: "Ruth Park", timeZone: "America/Los_Angeles", recovery, ownerName: "Dan" };

describe("Clerk identity", () => {
  it("a signed-in caller is their Clerk user, whatever userId they send", async () => {
    const t = backend();
    const dan = t.withIdentity({ subject: "user_dan" });
    const patientId = await dan.mutation(api.onboarding.createPatient, { userId: "demo-whatever", ...patient });
    const owner = await t.run((ctx) => ctx.db.get(patientId));
    expect(owner?.ownerUserId).toBe("user_dan");

    // Someone else signed in can't act as Dan by sending his id.
    const eve = t.withIdentity({ subject: "user_eve" });
    await expect(
      eve.mutation(api.onboarding.addMedication, { userId: "user_dan", patientId, name: "X", doseLabel: "1", times: ["08:00"] }),
    ).rejects.toThrow(/Only the person who set up Cadence/);

    await dan.mutation(api.onboarding.addMedication, { userId: "ignored", patientId, name: "X", doseLabel: "1", times: ["08:00"] });
  });

  it("signed out, the demo identity still works", async () => {
    const t = backend();
    const patientId = await t.mutation(api.onboarding.createPatient, { userId: "demo-1", ...patient });
    await t.mutation(api.onboarding.addMedication, { userId: "demo-1", patientId, name: "X", doseLabel: "1", times: ["08:00"] });
  });

  it("signed in, the patient list shows your patients and the demo patient only", async () => {
    const t = backend();
    await t.mutation(api.onboarding.createPatient, { userId: "demo-1", ...patient, name: "Someone Else" });
    await t.withIdentity({ subject: "user_dan" }).mutation(api.onboarding.createPatient, { userId: "x", ...patient });
    await t.mutation(api.seed.seedDemo, {});
    const names = (await t.withIdentity({ subject: "user_dan" }).query(api.reports.patients, {})).map((p) => p.name);
    expect(names.sort()).toEqual(["Ruth Park"]);
  });
});
