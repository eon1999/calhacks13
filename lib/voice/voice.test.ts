import { describe, expect, it, vi } from "vitest";

// agent.ts imports the Convex client + Anthropic SDK at module load; stub the I/O.
vi.mock("./convex", () => ({ convex: () => ({}) }));

import type { DoseSlot } from "../schedule";
import { conversationEvent, toMessages } from "./agent";
import {
  checkInTriggerFor,
  describeEvent,
  dueSlots,
  isSafetyEvent,
  nudgeKey,
  slotsForEvent,
} from "./events";
import { buildSystemPrompt, toSpeakable } from "./prompt";
import type { PatientContext } from "./context";

const slot = (overrides: Partial<DoseSlot>): DoseSlot => ({
  slotId: "m1@1",
  medicationId: "m1",
  name: "Acetaminophen",
  doseLabel: "1000 mg",
  time: "08:00",
  scheduledFor: 1,
  status: "due",
  ...overrides,
});

describe("events", () => {
  it("dueSlots keeps only due slots", () => {
    const slots = [slot({ slotId: "a" }), slot({ slotId: "b", status: "taken" })];
    expect(dueSlots(slots).map((s) => s.slotId)).toEqual(["a"]);
  });

  it("nudgeKey is order-independent", () => {
    expect(nudgeKey([slot({ slotId: "b" }), slot({ slotId: "a" })])).toBe("a,b");
  });

  it("describeEvent names the due medication", () => {
    expect(describeEvent("dose_due", [slot({})])).toContain("Acetaminophen (1000 mg) at 08:00");
    expect(describeEvent("fall", [])).toContain("fall");
  });

  it("maps events to check-in triggers", () => {
    expect(checkInTriggerFor("fall")).toBe("fall");
    expect(checkInTriggerFor("low_activity")).toBe("low_activity");
    expect(checkInTriggerFor("check_in")).toBe("scheduled");
    expect(checkInTriggerFor(null)).toBe("manual");
  });

  it("only fall and sos are safety events", () => {
    expect(isSafetyEvent("fall")).toBe(true);
    expect(isSafetyEvent("sos")).toBe(true);
    expect(isSafetyEvent("dose_due")).toBe(false);
  });

  it("describes missed doses and SOS", () => {
    expect(describeEvent("missed_dose", [slot({ status: "missed" })])).toContain("not confirmed");
    expect(describeEvent("missed_dose", [])).toContain("no doses are missed");
    expect(describeEvent("sos", [])).toContain("urgent");
    expect(describeEvent("dose_due", [])).toContain("already taken");
  });

  it("nudges gentle movement when the band sees hours of inactivity, within their care plan", () => {
    const text = describeEvent("low_activity", []);
    expect(text).toContain("barely moved");
    expect(text).toContain("care plan");
  });
});

describe("slotsForEvent", () => {
  const day = [
    slot({ slotId: "a", scheduledFor: 1, status: "missed" }),
    slot({ slotId: "b", scheduledFor: 2, status: "taken" }),
    slot({ slotId: "c1", scheduledFor: 3, status: "upcoming" }),
    slot({ slotId: "c2", scheduledFor: 3, status: "upcoming" }),
    slot({ slotId: "d", scheduledFor: 4, status: "upcoming" }),
  ];
  const ids = (slots: DoseSlot[]) => slots.map((s) => s.slotId);

  it("prefers slots that are actually due", () => {
    const withDue = [...day, slot({ slotId: "now", scheduledFor: 2, status: "due" })];
    expect(ids(slotsForEvent("dose_due", withDue))).toEqual(["now"]);
  });

  it("forced dose_due falls back to the next upcoming time, grouping same-time doses", () => {
    expect(ids(slotsForEvent("dose_due", day))).toEqual(["c1", "c2"]);
  });

  it("forced dose_due falls back to the latest missed when nothing is upcoming", () => {
    const evening = day.map((s) => (s.status === "upcoming" ? { ...s, status: "taken" as const } : s));
    expect(ids(slotsForEvent("dose_due", evening))).toEqual(["a"]);
  });

  it("missed_dose returns missed slots; other events return none", () => {
    expect(ids(slotsForEvent("missed_dose", day))).toEqual(["a"]);
    expect(slotsForEvent("fall", day)).toEqual([]);
  });
});

describe("toMessages", () => {
  it("replays events as user turns", () => {
    expect(
      toMessages([
        { role: "event", text: "[Wearable event] due" },
        { role: "assistant", text: "Time for your pill." },
        { role: "user", text: "Took it." },
      ]).map((m) => m.role),
    ).toEqual(["user", "assistant", "user"]);
  });

  it("drops leading assistant turns so the first message is from the user", () => {
    const messages = toMessages([
      { role: "assistant", text: "cut off" },
      { role: "user", text: "hi" },
    ]);
    expect(messages).toEqual([{ role: "user", content: "hi" }]);
  });
});

describe("conversationEvent", () => {
  it("finds the latest wearable event in the conversation", () => {
    expect(
      conversationEvent([
        { role: "event", text: "", event: "dose_due" },
        { role: "assistant", text: "" },
        { role: "event", text: "", event: "check_in" },
        { role: "user", text: "sore today" },
      ]),
    ).toBe("check_in");
  });

  it("returns null for patient-initiated conversations or unknown events", () => {
    expect(conversationEvent([{ role: "user", text: "hi" }])).toBeNull();
    expect(conversationEvent([{ role: "event", text: "", event: "bogus" }])).toBeNull();
  });
});

describe("prompt", () => {
  const ctx = {
    patient: { name: "Margaret", timeZone: "UTC" },
    slots: [slot({ slotId: "m1@99", status: "due" })],
    lastCheckIn: null,
    checkInsToday: [],
    alertsToday: [],
    careTeam: [],
  } as unknown as PatientContext;

  it("describes the recovery, care team and pending consent from onboarding", () => {
    const onboarded = {
      ...ctx,
      patient: {
        name: "Margaret Lee",
        preferredName: "Maggie",
        timeZone: "UTC",
        extraPatience: true,
        recovery: { procedure: "knee_replacement", surgeryDate: "2026-10-20", careNotes: "No kneeling" },
      },
      careTeam: [
        { name: "Sarah", role: "care_partner", relationship: "Daughter", urgentAlerts: true },
        { name: "Dr. Patel", role: "clinician", urgentAlerts: false },
      ],
    } as unknown as PatientContext;
    const prompt = buildSystemPrompt(onboarded, Date.UTC(2026, 9, 23, 8, 5));
    expect(prompt).toContain("Call them: Maggie");
    expect(prompt).toContain("Knee replacement, Day 3 after surgery · First days home");
    expect(prompt).toContain("Care notes from the family: No kneeling");
    expect(prompt).toContain("Speak extra slowly");
    expect(prompt).toContain("- Sarah (Daughter), gets urgent alerts");
    expect(prompt).toContain("- Dr. Patel (doctor or nurse), sees reports only");
    expect(prompt).toContain("Consent: not asked yet");
  });

  it("includes the patient, schedule slot ids, and statuses", () => {
    const prompt = buildSystemPrompt(ctx, Date.UTC(2026, 9, 23, 8, 5));
    expect(prompt).toContain("Patient: Margaret");
    expect(prompt).toContain("slot_id: m1@99");
    expect(prompt).toContain(": due");
    expect(prompt).toContain("No previous check-ins.");
    expect(prompt).toContain("Done today:\n- Nothing yet.");
  });

  it("lists today's alerts and check-ins so the agent doesn't repeat them", () => {
    const busy = {
      ...ctx,
      checkInsToday: [
        { at: Date.UTC(2026, 9, 23, 9, 0), state: "sore_but_managing", painScore: 6, notes: "knee throbbing" },
      ],
      alertsToday: [{ createdAt: Date.UTC(2026, 9, 23, 9, 1), tier: "notify", reason: "Wound looks red" }],
    } as unknown as PatientContext;
    const prompt = buildSystemPrompt(busy, Date.UTC(2026, 9, 23, 10, 0));
    expect(prompt).toContain("check-in saved: sore but managing, pain 6/10 (knee throbbing)");
    expect(prompt).toContain("care team alerted (notify): Wound looks red");
  });

  it("toSpeakable strips markdown and collapses whitespace", () => {
    expect(toSpeakable("**Hi**  Margaret,\n# take `it`")).toBe("Hi Margaret, take it");
  });
});
