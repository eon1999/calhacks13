import { describe, expect, it } from "vitest";
import { generateDemoHistory } from "../demo-history";
import { computeStats, doseOutcome, evidenceIds, type ReportInput } from "./stats";
import { dailyTemplate, looksLikeAdvice, reportMarkdown, reportTemplate, sanitizeReport } from "./summaries";

const TZ = "America/Los_Angeles";
const DAY = 86_400_000;
// 2026-10-24 16:30 PDT
const NOW = Date.UTC(2026, 9, 24, 23, 30);

const MEDS = [
  { id: "m1", name: "Acetaminophen", times: ["08:00", "14:00", "20:00"], windowMinutes: 60 },
  { id: "m2", name: "Apixaban", times: ["08:00", "20:00"], windowMinutes: 60 },
];

function demoInput(): ReportInput {
  const h = generateDemoHistory({ medications: MEDS, timeZone: TZ, now: NOW });
  const names = Object.fromEntries(MEDS.map((m) => [m.id, m]));
  return {
    timeZone: TZ,
    from: NOW - 14 * DAY,
    to: NOW,
    doses: h.doses.map((d, i) => ({
      id: `d${i}`,
      medicationId: d.medicationId,
      medicationName: names[d.medicationId].name,
      windowMinutes: names[d.medicationId].windowMinutes,
      scheduledFor: d.scheduledFor,
      status: d.status,
      openedAt: d.openedAt,
      confirmedAt: d.confirmedAt,
    })),
    checkIns: h.checkIns.map((c, i) => ({ id: `c${i}`, ...c })),
    events: h.events.map((e, i) => ({ id: `e${i}`, ...e })),
    activity: h.activity,
  };
}

describe("doseOutcome", () => {
  const base = { id: "x", medicationId: "m", medicationName: "A", scheduledFor: 0, windowMinutes: 30 };
  it("classifies by status and timing", () => {
    expect(doseOutcome({ ...base, status: "taken", confirmedAt: 10 * 60_000 })).toBe("on_time");
    expect(doseOutcome({ ...base, status: "taken", confirmedAt: 45 * 60_000 })).toBe("late");
    expect(doseOutcome({ ...base, status: "late", openedAt: 40 * 60_000 })).toBe("late");
    expect(doseOutcome({ ...base, status: "missed" })).toBe("missed");
    expect(doseOutcome({ ...base, status: "due" })).toBe("pending");
    expect(doseOutcome({ ...base, status: "extra_opening" })).toBe("extra");
  });
});

describe("computeStats on the demo history", () => {
  const stats = computeStats(demoInput());

  it("counts adherence", () => {
    const a = stats.adherence;
    expect(a.missed).toBeGreaterThanOrEqual(4);
    expect(a.late).toBeGreaterThanOrEqual(3);
    expect(a.extraOpenings).toBe(1);
    expect(a.rate).toBeGreaterThan(80);
    expect(a.rate).toBeLessThan(100);
  });

  it("finds the story's patterns, each with evidence", () => {
    const ids = stats.patterns.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining(["pain_after_dose", "missed_time_of_day", "pain_trend", "late_doses", "extra_openings", "falls", "red_flags"]),
    );
    for (const p of stats.patterns) expect(p.evidenceIds.length).toBeGreaterThan(0);
    expect(stats.pain.trend).toBe("improving");
    const allowed = new Set(evidenceIds(stats));
    for (const p of stats.patterns) for (const id of p.evidenceIds) expect(allowed.has(id)).toBe(true);
  });

  it("has a row per day with steps rising", () => {
    expect(stats.days.length).toBeGreaterThanOrEqual(14);
    expect(stats.activity.recentStepsPerDay!).toBeGreaterThan(stats.activity.earlyStepsPerDay!);
  });

  it("the template report cites only allowed ids and carries no advice", () => {
    const report = reportTemplate(TZ, stats);
    const clean = sanitizeReport(report, evidenceIds(stats), report);
    expect(clean.sections.map((s) => s.title)).toEqual([
      "Adherence",
      "Symptom observations",
      "Events",
      "Patient-reported states",
      "Patterns to discuss",
    ]);
    expect(looksLikeAdvice(reportMarkdown(clean))).toBe(false);
  });

  it("sanitizeReport drops made-up citations and fills missing sections", () => {
    const fallback = reportTemplate(TZ, stats);
    const out = sanitizeReport(
      { sections: [{ title: "Adherence", bullets: [{ text: "x", evidenceIds: ["made-up", stats.adherence.missedIds[0]] }] }] },
      evidenceIds(stats),
      fallback,
    );
    expect(out.sections[0].bullets[0].evidenceIds).toEqual([stats.adherence.missedIds[0]]);
    expect(out.sections).toHaveLength(5);
  });
});

describe("dailyTemplate", () => {
  it("summarises a day within 120 words", () => {
    const input = demoInput();
    const stats = computeStats({ ...input, from: NOW - DAY / 2 });
    const out = dailyTemplate("Margaret", TZ, stats, []);
    expect(out.summary.split(/\s+/).length).toBeLessThanOrEqual(120);
    expect(out.summary).toContain("Margaret");
  });
});

describe("looksLikeAdvice", () => {
  it("catches dose advice", () => {
    expect(looksLikeAdvice("You should increase the dose of acetaminophen.")).toBe(true);
    expect(looksLikeAdvice("Pain was higher four hours after a dose.")).toBe(false);
  });
});
