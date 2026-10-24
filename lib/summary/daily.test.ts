import { describe, expect, it } from "vitest";
import type { DoseSlot } from "../schedule";
import { composeDailySummary, MAX_SUMMARY_LENGTH, summaryDue, type DailySummaryInput } from "./daily";

const slot = (name: string, time: string, status: DoseSlot["status"]): DoseSlot => ({
  slotId: `${name}@${time}`,
  medicationId: name,
  name,
  doseLabel: "1 tablet",
  time,
  scheduledFor: 0,
  status,
});

const base: DailySummaryInput = {
  patientName: "Margaret",
  recovery: { procedure: "knee_replacement", surgeryDate: "2026-10-19" },
  today: "2026-10-24",
  slots: ["08:00", "14:00", "20:00"].flatMap((t) => [slot("Acetaminophen", t, "taken"), slot("Cephalexin", t, "taken")]),
  checkIns: [
    { at: 1, state: "sore_but_managing", painScore: 5, redFlag: false },
    { at: 2, state: "doing_well", painScore: 3, redFlag: false },
  ],
  alerts: [],
  events: [],
};

describe("composeDailySummary", () => {
  it("reads like the example for a calm day", () => {
    expect(composeDailySummary(base)).toBe(
      "Cadence · Margaret, day 5 after knee replacement: took 6/6 medicines, pain 5→3, last check-in: doing well, no warning signs.",
    );
  });

  it("counts doses so far and names missed ones", () => {
    const slots = [slot("Apixaban", "08:00", "missed"), slot("Acetaminophen", "08:00", "taken"), slot("Apixaban", "20:00", "upcoming")];
    expect(composeDailySummary({ ...base, slots })).toContain("took 1/2 medicines so far (missed Apixaban 08:00)");
  });

  it("calls out warning signs, falls and SOS", () => {
    const text = composeDailySummary({
      ...base,
      checkIns: [{ at: 1, state: "struggling", painScore: 7, redFlag: true, notes: "Wound red and warm" }],
      events: [{ type: "fall", at: 1 }, { type: "sos", at: 2 }],
    });
    expect(text).toContain("pain 7/10");
    expect(text).toContain("1 possible fall, SOS pressed, 1 warning sign: Wound red and warm");
    expect(text).not.toContain("no warning signs");
  });

  it("adds a brief line for heads-ups held in quiet hours", () => {
    const text = composeDailySummary({ ...base, held: [{ reason: "Check-in red flag: calf pain" }, { reason: "x" }] });
    expect(text.endsWith(" Held in quiet hours: 2 heads-ups (Check-in red flag: calf pain).")).toBe(true);
  });

  it("handles a day with no medicines or check-ins, and patients without a recovery profile", () => {
    expect(composeDailySummary({ ...base, recovery: undefined, slots: [], checkIns: [] })).toBe(
      "Cadence · Margaret today: no check-ins yet, no warning signs.",
    );
    expect(composeDailySummary({ ...base, today: "2026-10-19" })).toMatch(/^Cadence · Margaret, surgery day \(knee replacement\):/);
    expect(composeDailySummary({ ...base, today: "2026-10-17" })).toMatch(/2 days before knee replacement/);
  });

  it("stays within two SMS segments by dropping the least important details", () => {
    const text = composeDailySummary({
      ...base,
      patientName: "Margaret Elizabeth Montgomery-Smythe",
      recovery: { procedure: "other", procedureOther: "Revision of a left total hip arthroplasty with bone graft", surgeryDate: "2026-10-19" },
      slots: ["06:00", "08:00", "10:00", "12:00"].map((t) => slot("Oxycodone hydrochloride", t, "missed")),
      checkIns: [{ at: 1, state: "struggling", painScore: 8, redFlag: true, notes: "a".repeat(200) }],
      steps: 12_000,
      held: [{ reason: "b".repeat(200) }],
    });
    expect(text.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
    expect(text).toContain("warning sign");
    expect(text).not.toContain("steps");
  });
});

describe("summaryDue", () => {
  const TZ = "America/Los_Angeles";
  const pdt = (hhmm: string) => Date.parse(`2026-10-24T${hhmm}:00-07:00`);

  it("is due from the summary time until the window passes, in the patient's time zone", () => {
    expect(summaryDue("19:00", TZ, pdt("18:59"))).toBe(false);
    expect(summaryDue("19:00", TZ, pdt("19:00"))).toBe(true);
    expect(summaryDue("19:00", TZ, pdt("19:14"))).toBe(true);
    expect(summaryDue("19:00", TZ, pdt("19:25"))).toBe(false);
    expect(summaryDue("19:00", "UTC", pdt("19:00"))).toBe(false);
  });
});
