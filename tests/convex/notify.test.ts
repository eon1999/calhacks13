// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { PRESETS } from "../../lib/notify/preferences";
import { backend } from "./setup";

const TZ = "America/Los_Angeles";
const pdt = (day: number, hhmm: string) => Date.parse(`2026-10-${day}T${hhmm}:00-07:00`);
const important = { ...PRESETS.important.values, summaryTime: "19:00" };
const emergencies = { ...PRESETS.emergencies.values, summaryTime: "19:00" };

async function team(t: ReturnType<typeof backend>) {
  return t.run(async (ctx) => {
    const patientId = await ctx.db.insert("patients", {
      name: "Ruth Park",
      timeZone: TZ,
      recovery: { procedure: "hip_replacement", surgeryDate: "2026-10-22", dischargeDate: "2026-10-23" },
    });
    const dan = await ctx.db.insert("careTeamMembers", {
      patientId,
      userId: "dan",
      role: "care_partner",
      permissions: ["alerts", "summary"],
      name: "Dan",
      isOwner: true,
      urgentAlerts: true,
      phone: "+14155550101",
    });
    const ana = await ctx.db.insert("careTeamMembers", {
      patientId,
      userId: "ana",
      role: "caregiver",
      permissions: ["alerts"],
      name: "Ana",
      urgentAlerts: true,
      phone: "+14155550102",
    });
    await ctx.db.insert("medications", {
      patientId,
      name: "Acetaminophen",
      doseLabel: "1000 mg",
      times: ["08:00", "14:00", "20:00"],
      windowMinutes: 60,
      active: true,
    });
    return { patientId, dan, ana };
  });
}

const texts = (t: ReturnType<typeof backend>) =>
  t.run((ctx) => ctx.db.query("textMessages").collect());

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("text notifications", () => {
  it("texts care alerts by preference, holds heads-ups in quiet hours, and never texts band prompts", async () => {
    vi.setSystemTime(pdt(24, "14:05"));
    const t = backend();
    const { patientId, dan, ana } = await team(t);

    // Only the owner or patient can change someone else's settings.
    await expect(
      t.mutation(api.notify.setNotificationPreferences, { userId: "ana", memberId: dan, preferences: emergencies }),
    ).rejects.toThrow(/Only the person who set up Cadence/);
    await t.mutation(api.notify.setNotificationPreferences, { userId: "ana", memberId: ana, preferences: emergencies });
    await t.mutation(api.notify.setNotificationPreferences, { userId: "dan", memberId: dan, preferences: important });

    vi.setSystemTime(pdt(24, "23:30"));
    await t.mutation(api.voice.recordCheckIn, {
      patientId,
      trigger: "scheduled",
      transcript: "my calf hurts",
      state: "struggling",
      painScore: 6,
      notes: "New calf pain and swelling",
      redFlag: true,
    });
    await t.mutation(api.voice.createAlert, { patientId, tier: "urgent", reason: "Said she fell in the hallway" });
    // A band prompt ("ask" with a prompt kind) is spoken, not texted.
    await t.run(async (ctx) => {
      const { raiseAlert } = await import("../../convex/alerts");
      await raiseAlert(ctx, { patientId, tier: "ask", kind: "dose_reminder", reason: "Time for Acetaminophen" });
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const log = await texts(t);
    const held = log.filter((x) => x.heldForSummary);
    expect(held.map((x) => x.memberId)).toEqual([dan]);
    expect(held[0].reason).toBe("Quiet hours, saved for the daily summary");
    expect(log.filter((x) => x.body.includes("URGENT")).map((x) => x.memberId).sort()).toEqual([dan, ana].sort());
    expect(log.some((x) => x.body.includes("Acetaminophen"))).toBe(false);
    // Ana chose emergencies only: no heads-up for her at all.
    expect(log.filter((x) => x.memberId === ana)).toHaveLength(1);

    // Next evening: Dan's summary text folds in the held heads-up, once.
    vi.setSystemTime(pdt(25, "19:05"));
    await t.action(internal.summary.sendDueSummaries, {});
    vi.setSystemTime(pdt(25, "19:15"));
    await t.action(internal.summary.sendDueSummaries, {});
    const summaries = (await texts(t)).filter((x) => x.summaryId);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].memberId).toBe(dan);
    expect(summaries[0].body).toMatch(/^Cadence · Ruth Park, day 3 after hip replacement:/);
    expect(summaries[0].body).toContain("Held in quiet hours: 1 heads-up (Check-in red flag: New calf pain and swelling)");
    // Stored apart from the dashboard's Claude summary.
    const rows = await t.run((ctx) => ctx.db.query("summaries").collect());
    expect(rows.map((r) => [r.kind, r.model])).toEqual([["daily_sms", "rules"]]);
  });

  it("warns when nobody with a phone would get urgent texts", async () => {
    vi.setSystemTime(pdt(24, "14:05"));
    const t = backend();
    const { patientId, dan, ana } = await team(t);
    const off = { ...important, urgent: false };
    await t.mutation(api.notify.setNotificationPreferences, { userId: "dan", memberId: dan, preferences: off });
    expect((await t.query(api.notify.overview, { userId: "dan", patientId }))!.urgentGap).toBe(false);
    await t.mutation(api.notify.setNotificationPreferences, { userId: "dan", memberId: ana, preferences: off });
    expect((await t.query(api.notify.overview, { userId: "dan", patientId }))!.urgentGap).toBe(true);
  });
});

describe("scheduled check-ins", () => {
  it("raises one check-in prompt per slot from the dose engine, and none once they've checked in", async () => {
    const t = backend();
    vi.setSystemTime(pdt(24, "10:00"));
    const { patientId } = await team(t); // day 2 after surgery: three a day, at 11:00, 15:15 and 18:45
    const prompts = async () => (await t.query(api.alerts.pendingPrompts, { patientId, now: Date.now() })).filter((p) => p.kind === "check_in");

    await t.mutation(internal.doses.tick, {});
    expect(await prompts()).toHaveLength(0);

    vi.setSystemTime(pdt(24, "11:01"));
    await t.mutation(internal.doses.tick, {});
    vi.setSystemTime(pdt(24, "11:02"));
    await t.mutation(internal.doses.tick, {});
    const due = await prompts();
    expect(due).toHaveLength(1);
    expect(due[0].reason).toBe("Time for Ruth's 11 AM check-in (first days home).");

    // Spoken and answered: the next slot comes at 15:15, not before.
    await t.mutation(api.alerts.markDelivered, { alertId: due[0]._id });
    await t.mutation(api.voice.recordCheckIn, {
      patientId,
      trigger: "scheduled",
      transcript: "fine",
      state: "doing_well",
      redFlag: false,
    });
    vi.setSystemTime(pdt(24, "15:00"));
    await t.mutation(internal.doses.tick, {});
    expect(await prompts()).toHaveLength(0);
    vi.setSystemTime(pdt(24, "15:16"));
    await t.mutation(internal.doses.tick, {});
    expect((await prompts()).map((p) => p.reason)).toEqual(["Time for Ruth's 3:15 PM check-in (first days home)."]);
  });
});
