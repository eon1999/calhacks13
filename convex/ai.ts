"use node";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { v } from "convex/values";
import type { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { evidenceIds, type ReportStats } from "../lib/reports/stats";
import {
  DAILY_SYSTEM,
  dailyPrompt,
  dailySummaryOutput,
  dailyTemplate,
  looksLikeAdvice,
  REPORT_SYSTEM,
  reportMarkdown,
  reportOutput,
  reportPrompt,
  reportTemplate,
  sanitizeReport,
  SUMMARY_MODEL,
  type DailySummaryOutput,
  type DayTimelineItem,
  type ReportSections,
} from "../lib/reports/summaries";

// Claude writes the daily care summary and the clinician report. It only puts
// precomputed numbers (lib/reports/stats.ts) into words; output is validated
// with zod, citations are checked, and anything that fails, or a missing
// ANTHROPIC_API_KEY, falls back to a fixed template. Prompts and responses are
// logged to `aiLogs`.
//
// Setup:  npx convex env set ANTHROPIC_API_KEY sk-ant-...

const TEMPLATE = "template";

async function askClaude<T extends z.ZodType>(
  ctx: ActionCtx,
  job: { patientId: Id<"patients">; name: string; system: string; prompt: string; schema: T; maxTokens: number },
): Promise<z.infer<T> | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  let response = "";
  try {
    const client = new Anthropic();
    const res = await client.beta.messages.parse({
      model: SUMMARY_MODEL,
      max_tokens: job.maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(job.schema) },
      system: job.system,
      messages: [{ role: "user", content: job.prompt }],
    });
    response = JSON.stringify(res.parsed_output ?? res.content);
    if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`No usable output (${res.stop_reason})`);
    await ctx.runMutation(internal.reports.logAi, {
      patientId: job.patientId,
      job: job.name,
      model: res.model,
      prompt: job.prompt,
      response,
      ok: true,
    });
    return res.parsed_output as z.infer<T>;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[ai] ${job.name} failed`, message);
    await ctx.runMutation(internal.reports.logAi, {
      patientId: job.patientId,
      job: job.name,
      model: SUMMARY_MODEL,
      prompt: job.prompt,
      response,
      ok: false,
      error: message.slice(0, 500),
    });
    return null;
  }
}

interface DailyInput {
  firstName: string;
  timeZone: string;
  stats: ReportStats;
  timeline: DayTimelineItem[];
  periodStart: number;
}

interface ClinicianInput {
  firstName: string;
  timeZone: string;
  stats: ReportStats;
  from: number;
  to: number;
}

async function dailySummary(ctx: ActionCtx, patientId: Id<"patients">): Promise<{ model: string }> {
  const now = Date.now();
  const input: DailyInput | null = await ctx.runQuery(internal.reports.dailyInput, { patientId, now });
  if (!input) throw new Error("Patient not found");
  const { firstName, timeZone, stats, timeline } = input;
  const allowed = new Set(timeline.map((t) => t.id));

  const fromClaude: DailySummaryOutput | null = await askClaude(ctx, {
    patientId,
    name: "daily_summary",
    system: DAILY_SYSTEM,
    prompt: dailyPrompt(firstName, timeZone, stats, timeline),
    schema: dailySummaryOutput,
    maxTokens: 2048,
  });
  const usable: boolean = !!fromClaude &&
    fromClaude!.summary.trim().split(/\s+/).length <= 140 &&
    !looksLikeAdvice(fromClaude!.summary);
  const out: DailySummaryOutput = usable ? fromClaude! : dailyTemplate(firstName, timeZone, stats, timeline);

  await ctx.runMutation(internal.reports.saveSummary, {
    patientId,
    kind: "daily",
    periodStart: input.periodStart,
    periodEnd: now,
    body: out.summary.trim(),
    evidenceIds: out.citedIds.filter((id) => allowed.has(id)),
    model: usable ? SUMMARY_MODEL : TEMPLATE,
  });
  return { model: usable ? SUMMARY_MODEL : TEMPLATE };
}

/** 8 PM cron (convex/reports.ts dueDailySummaries). */
export const generateDailySummary = internalAction({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    await dailySummary(ctx, patientId);
  },
});

/** "Write today's summary now" on the care dashboard. */
export const requestDailySummary = action({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }): Promise<{ model: string }> => dailySummary(ctx, patientId),
});

/** "Generate observations" on the clinician report. */
export const generateClinicianReport = action({
  args: { patientId: v.id("patients"), from: v.number(), to: v.number() },
  handler: async (ctx, { patientId, from, to }): Promise<{ model: string }> => {
    const input: ClinicianInput | null = await ctx.runQuery(internal.reports.clinicianInput, { patientId, from, to });
    if (!input) throw new Error("Patient not found");
    const { firstName, timeZone, stats } = input;
    const allowed = evidenceIds(stats);
    const fallback = reportTemplate(timeZone, stats);

    const fromClaude: ReportSections | null = await askClaude(ctx, {
      patientId,
      name: "clinician_report",
      system: REPORT_SYSTEM,
      prompt: reportPrompt(firstName, timeZone, stats, allowed),
      schema: reportOutput,
      maxTokens: 4096,
    });
    const cleaned: ReportSections | null = fromClaude ? sanitizeReport(fromClaude, allowed, fallback) : null;
    const usable: boolean = !!cleaned && !looksLikeAdvice(reportMarkdown(cleaned!));
    const sections: ReportSections = usable ? cleaned! : sanitizeReport(fallback, allowed, fallback);

    await ctx.runMutation(internal.reports.saveSummary, {
      patientId,
      kind: "clinician",
      periodStart: input.from,
      periodEnd: input.to,
      body: reportMarkdown(sections),
      evidenceIds: [...new Set(sections.sections.flatMap((s) => s.bullets.flatMap((b) => b.evidenceIds)))],
      model: usable ? SUMMARY_MODEL : TEMPLATE,
      sections,
    });
    return { model: usable ? SUMMARY_MODEL : TEMPLATE };
  },
});
