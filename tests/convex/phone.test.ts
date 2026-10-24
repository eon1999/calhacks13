// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { backend } from "./setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("urgent-alert phone calls", () => {
  it("calls emergency contacts for urgent alerts only, as a dry run without Cartesia", async () => {
    vi.setSystemTime(Date.parse("2026-10-24T14:05:00-07:00"));
    const t = backend();
    const patientId = await t.run((ctx) =>
      ctx.db.insert("patients", {
        name: "Ruth Park",
        preferredName: "Ruth",
        timeZone: "America/Los_Angeles",
        emergencyContacts: [{ name: "Dan", relationship: "Son", phone: "(415) 555-0101" }],
      }),
    );

    await t.mutation(api.voice.createAlert, { patientId, tier: "notify", reason: "Wound looks red" });
    await t.mutation(api.voice.createAlert, { patientId, tier: "urgent", reason: "Said she fell in the hallway" });
    // Same moment, merged into the first urgent alert: no second call, and the
    // one call reads the merged reason.
    await t.mutation(api.voice.createAlert, { patientId, tier: "urgent", reason: "Can't get up" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const calls = await t.run((ctx) => ctx.db.query("phoneCalls").collect());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: "Dan",
      to: "+14155550101",
      problem: "Said she fell in the hallway · Can't get up",
      status: "skipped",
    });
    expect(calls[0].reason).toMatch(/no Cartesia env vars/);
  });
});
