// Prompts, output schemas and fixed-template fallbacks for the daily care
// summary and the clinician report. Claude only words what lib/reports/stats.ts
// computed; if Claude is unavailable or its output fails validation, the
// template version is used instead.

import { z } from "zod";
import { formatLocalTime } from "../schedule";
import type { ReportStats } from "./stats";

export const SUMMARY_MODEL = "claude-sonnet-5-5";
export const DISCLAIMER = "Observations for discussion with the care team, not medical advice.";

// ---------------------------------------------------------------------------
// Daily summary (care partner, 8 PM)
// ---------------------------------------------------------------------------

export const dailySummaryOutput = z.object({
  summary: z.string().describe("Plain-language summary of the day, at most 120 words, with local times. No advice."),
  citedIds: z.array(z.string()).describe("Ids of the rows the summary relies on, from the allowed list."),
});
export type DailySummaryOutput = z.infer<typeof dailySummaryOutput>;

export const DAILY_SYSTEM = `You write the evening update a family member reads about their relative who is recovering at home after surgery.
Write at most 120 words of plain, warm, factual prose. Use local times (like "2:03 PM") from the data.
Say what happened: doses taken, late or missed; how they said they felt and any pain scores; falls, SOS or alerts and how they were handled; how much they moved.
Rules: describe only what is in the data. Never give medical advice, never suggest changing medicines or the schedule, never diagnose.
If a warning sign was reported, say the care team was told and leave decisions to them. Cite the ids of rows you rely on in citedIds, using only ids from the allowed list.`;

export interface DayTimelineItem {
  id: string;
  at: number;
  kind: string;
  text: string;
}

export function dailyPrompt(firstName: string, timeZone: string, stats: ReportStats, timeline: DayTimelineItem[]): string {
  return JSON.stringify(
    {
      patient: firstName,
      day: stats.days.at(-1)?.date,
      adherence: {
        scheduled: stats.adherence.scheduled,
        onTime: stats.adherence.onTime,
        late: stats.adherence.late,
        missed: stats.adherence.missed,
        stillOpen: stats.adherence.pending,
        extraOpenings: stats.adherence.extraOpenings,
      },
      painAverage: stats.pain.average,
      checkInStates: stats.checkIns.states,
      steps: stats.days.at(-1)?.steps ?? 0,
      timeline: timeline.map((t) => ({ id: t.id, time: formatLocalTime(timeZone, t.at), kind: t.kind, what: t.text })),
      allowedIds: timeline.map((t) => t.id),
    },
    null,
    1,
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function dailyTemplate(firstName: string, timeZone: string, stats: ReportStats, timeline: DayTimelineItem[]): DailySummaryOutput {
  const a = stats.adherence;
  const parts: string[] = [];
  if (a.scheduled) {
    const bits = [`${a.onTime} on time`];
    if (a.late) bits.push(`${a.late} late`);
    if (a.missed) bits.push(`${a.missed} missed`);
    if (a.pending) bits.push(`${a.pending} still to come`);
    parts.push(`${firstName} had ${plural(a.scheduled, "dose")} today: ${bits.join(", ")}.`);
  } else {
    parts.push(`No doses were scheduled for ${firstName} today.`);
  }
  if (stats.checkIns.count) {
    const pain = stats.pain.average !== null ? ` Average pain was ${stats.pain.average}/10.` : "";
    const s = stats.checkIns.states;
    const feel = s.struggling ? "said they were struggling at least once" : s.sore_but_managing ? "said they were sore but managing" : "said they were doing well";
    parts.push(`In ${plural(stats.checkIns.count, "check-in")} they ${feel}.${pain}`);
  }
  for (const f of stats.safety.falls) {
    parts.push(
      `A possible fall was detected at ${formatLocalTime(timeZone, f.at)}; ${f.resolution === "ok" ? "they said they were okay" : "the care team was alerted"}.`,
    );
  }
  for (const s of stats.safety.sos) parts.push(`The SOS button was pressed at ${formatLocalTime(timeZone, s.at)}.`);
  if (stats.checkIns.redFlags.length) parts.push("A warning sign came up in a check-in and the care team was told.");
  const steps = stats.days.at(-1)?.steps ?? 0;
  if (steps) parts.push(`They took about ${steps.toLocaleString("en-US")} steps.`);
  return { summary: parts.join(" "), citedIds: timeline.slice(0, 12).map((t) => t.id) };
}

// ---------------------------------------------------------------------------
// Clinician report
// ---------------------------------------------------------------------------

export const SECTION_TITLES = [
  "Adherence",
  "Symptom observations",
  "Events",
  "Patient-reported states",
  "Patterns to discuss",
] as const;

export const reportOutput = z.object({
  sections: z
    .array(
      z.object({
        title: z.enum(SECTION_TITLES),
        bullets: z
          .array(
            z.object({
              text: z.string().describe("One factual observation, one or two sentences."),
              evidenceIds: z.array(z.string()).describe("Ids from allowedIds that support this bullet."),
            }),
          )
          .describe("2–4 bullets."),
      }),
    )
    .describe("One entry per section title, in order."),
});
export type ReportSections = z.infer<typeof reportOutput>;

export const REPORT_SYSTEM = `You write the observation report a surgeon or clinician reads before a follow-up visit for a patient recovering at home.
You are given precomputed statistics and patterns. Write the five sections in order: ${SECTION_TITLES.join(", ")}.
Rules:
- State only facts and patterns present in the input. Do not compute new statistics or infer causes.
- "Patterns to discuss" may only restate the input's patterns (and may say there were none).
- Every bullet cites evidenceIds taken from allowedIds; a bullet about totals may cite none.
- Never give medical advice, never suggest changing a medicine, dose or schedule, never diagnose.
- Clinical, concise wording. Use local dates and times from the input.`;

export function reportPrompt(firstName: string, timeZone: string, stats: ReportStats, allowedIds: string[]): string {
  const time = (at: number) => formatLocalTime(timeZone, at);
  return JSON.stringify(
    {
      patient: firstName,
      period: { from: stats.days[0]?.date, to: stats.days.at(-1)?.date, days: stats.period.days },
      adherence: { ...stats.adherence, missedIds: undefined, lateIds: undefined, extraIds: undefined },
      missedDoseIds: stats.adherence.missedIds,
      lateDoseIds: stats.adherence.lateIds,
      pain: {
        checkIns: stats.pain.count,
        average: stats.pain.average,
        earlyAverage: stats.pain.earlyAverage,
        recentAverage: stats.pain.recentAverage,
        trend: stats.pain.trend,
        byHoursSinceDose: stats.pain.bySinceDose.map((b) => ({ bucket: b.bucket, average: b.average, n: b.n })),
      },
      checkInStates: stats.checkIns.states,
      redFlags: stats.checkIns.redFlags.map((r) => ({ id: r.id, time: time(r.at), notes: r.notes })),
      falls: stats.safety.falls.map((f) => ({ id: f.id, time: time(f.at), resolution: f.resolution })),
      sos: stats.safety.sos.map((s) => ({ id: s.id, time: time(s.at) })),
      activity: stats.activity,
      daily: stats.days,
      patterns: stats.patterns,
      allowedIds,
    },
    null,
    1,
  );
}

const STATE_WORDS: Record<keyof ReportStats["checkIns"]["states"], string> = {
  doing_well: "doing well",
  sore_but_managing: "sore but managing",
  struggling: "struggling",
  unsure: "unsure",
};

export function reportTemplate(timeZone: string, stats: ReportStats): ReportSections {
  const a = stats.adherence;
  const p = stats.pain;
  const time = (at: number) => formatLocalTime(timeZone, at);
  const adherence = [
    {
      text:
        a.rate === null
          ? "No dose windows closed in this period."
          : `${a.onTime + a.late} of ${a.onTime + a.late + a.missed} closed doses were taken (${a.rate}%): ${a.onTime} on time, ${a.late} late, ${a.missed} missed.`,
      evidenceIds: [],
    },
    ...a.byMedication
      .filter((m) => m.missed || m.late)
      .map((m) => ({ text: `${m.name}: ${m.missed} missed, ${m.late} late.`, evidenceIds: [] })),
  ];
  const symptoms = [
    {
      text: p.count
        ? `${p.count} pain scores were reported, averaging ${p.average}/10${p.trend !== "unknown" ? ` (${p.earlyAverage}/10 early in the period, ${p.recentAverage}/10 recently)` : ""}.`
        : "No pain scores were reported.",
      evidenceIds: p.points.slice(-4).map((x) => x.id),
    },
    ...(stats.activity.stepsPerDay !== null
      ? [
          {
            text: `About ${stats.activity.stepsPerDay.toLocaleString("en-US")} steps a day${stats.activity.recentStepsPerDay !== null ? ` (${stats.activity.earlyStepsPerDay?.toLocaleString("en-US")} early, ${stats.activity.recentStepsPerDay.toLocaleString("en-US")} recently)` : ""}${stats.activity.avgHeartRate ? `; average heart rate ${stats.activity.avgHeartRate} bpm` : ""}.`,
            evidenceIds: [],
          },
        ]
      : []),
  ];
  const events = [
    ...stats.safety.falls.map((f) => ({
      text: `Possible fall at ${time(f.at)} on ${new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(new Date(f.at))}: ${f.resolution === "ok" ? "patient said they were okay" : f.resolution === "helped" ? "care team contacted" : "no answer; care team alerted"}.`,
      evidenceIds: [f.id],
    })),
    ...stats.safety.sos.map((s) => ({ text: `SOS pressed at ${time(s.at)}.`, evidenceIds: [s.id] })),
    ...stats.checkIns.redFlags.map((r) => ({ text: `Warning sign reported: ${r.notes ?? "see check-in"}.`, evidenceIds: [r.id] })),
  ];
  const states = Object.entries(stats.checkIns.states)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${STATE_WORDS[s as keyof typeof STATE_WORDS]} ${n}`)
    .join(", ");
  return {
    sections: [
      { title: "Adherence", bullets: adherence },
      { title: "Symptom observations", bullets: symptoms },
      { title: "Events", bullets: events.length ? events : [{ text: "No falls, SOS presses or warning signs.", evidenceIds: [] }] },
      {
        title: "Patient-reported states",
        bullets: [{ text: stats.checkIns.count ? `${stats.checkIns.count} check-ins: ${states}.` : "No check-ins recorded.", evidenceIds: [] }],
      },
      {
        title: "Patterns to discuss",
        bullets: stats.patterns.length
          ? stats.patterns.map((x) => ({ text: x.text, evidenceIds: x.evidenceIds }))
          : [{ text: "No patterns met the reporting thresholds.", evidenceIds: [] }],
      },
    ],
  };
}

/** Drops citations Claude made up, and fills any missing section from the template. */
export function sanitizeReport(report: ReportSections, allowedIds: string[], fallback: ReportSections): ReportSections {
  const allowed = new Set(allowedIds);
  return {
    sections: SECTION_TITLES.map((title) => {
      const fromClaude = report.sections.find((s) => s.title === title);
      const section = fromClaude?.bullets.length ? fromClaude : fallback.sections.find((s) => s.title === title)!;
      return {
        title,
        bullets: section.bullets.map((b) => ({ text: b.text.trim(), evidenceIds: b.evidenceIds.filter((id) => allowed.has(id)) })),
      };
    }),
  };
}

/** Markdown version of a report, stored in summaries.body. */
export function reportMarkdown(report: ReportSections): string {
  return [
    ...report.sections.flatMap((s) => [`## ${s.title}`, ...s.bullets.map((b) => `- ${b.text}${b.evidenceIds.length ? ` [${b.evidenceIds.join(", ")}]` : ""}`), ""]),
    `_${DISCLAIMER}_`,
  ].join("\n");
}

/** Phrases that look like advice; their presence sends the output to the template. */
const ADVICE = /\b(you should|should (?:increase|decrease|stop|start|take|reduce)|increase (?:the|her|his|their) dose|decrease (?:the|her|his|their) dose|double (?:up|the dose)|stop taking|recommend)\b/i;

export function looksLikeAdvice(text: string): boolean {
  return ADVICE.test(text);
}
