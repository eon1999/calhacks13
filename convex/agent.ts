"use node";

/**
 * convex/agent.ts
 *
 * Condition research agent. Given a new user profile (conditions + meds),
 * Claude searches a fixed allowlist of trusted medical sources and returns a
 * structured, cited research draft that the rest of Cadence can turn into a
 * condition profile (check-in states, red flags, dose-window defaults...).
 *
 * The output is a DRAFT for human/clinician review. It never sets doses or
 * schedules; those still come from the prescriber via `medications`.
 *
 * Setup:  npx convex env set ANTHROPIC_API_KEY sk-ant-...
 * Usage:  await ctx.runAction(api.agent.researchProfile, { profile: {...} })
 */

import Anthropic from "@anthropic-ai/sdk";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MODEL = "claude-sonnet-5-5";
// Server-side web search tool. The type string is versioned; check
// https://docs.claude.com for the newest version if this one is rejected.
const WEB_SEARCH_TOOL_TYPE = "web_search_20250305";
const MAX_SEARCHES = 12;
const MAX_TURNS = 8; // guards the pause_turn / retry loop

const TRUSTED_DOMAINS = [
  "medlineplus.gov",
  "nih.gov", // covers ninds.nih.gov, ncbi.nlm.nih.gov, dailymed.nlm.nih.gov
  "cdc.gov",
  "fda.gov",
  "nice.org.uk",
  "nhs.uk",
  "who.int",
  "mayoclinic.org",
  "clevelandclinic.org",
  "parkinson.org",
  "epilepsy.com",
  "diabetes.org",
  "heart.org",
  "nationalmssociety.org",
  "stroke.org",
];

// ---------------------------------------------------------------------------
// Output schema (zod v4) - shared shape the rest of the app can import
// ---------------------------------------------------------------------------

const relevance = z.enum(["primary", "secondary", "ignore"]);
const alertTier = z.enum(["info", "ask", "notify", "urgent"]);
const source = z.object({ title: z.string(), url: z.string() });

export const conditionResearchSchema = z.object({
  input: z.string().describe("The condition exactly as the user entered it"),
  normalizedName: z.string(),
  icd10: z.string().optional(),
  summary: z.string().describe("2-3 plain-language sentences"),
  checkInStates: z
    .array(z.object({ key: z.string(), label: z.string(), description: z.string() }))
    .describe("3-5 states a patient could report in a short voice check-in, plus 'unsure'"),
  checkInQuestions: z.array(z.string()).describe("Short, non-diagnostic questions"),
  sensorRelevance: z.object({
    tremor: relevance,
    falls: relevance,
    suddenShaking: relevance.describe("Sudden high-intensity shaking, e.g. seizure-like"),
    rationale: z.string(),
  }),
  fluctuationPatterns: z
    .array(z.string())
    .describe("Time-of-day effects, wearing-off, triggers worth correlating with doses"),
  redFlags: z.array(
    z.object({
      signal: z.string(),
      suggestedTier: alertTier,
      rationale: z.string(),
      sourceUrl: z.string(),
    }),
  ),
  carePartnerTips: z.array(z.string()),
  clinicianMetrics: z
    .array(z.string())
    .describe("Scales or logs clinicians use, e.g. seizure frequency, MDS-UPDRS items"),
  sources: z.array(source).min(1),
});

export const medicationResearchSchema = z.object({
  input: z.string(),
  normalizedName: z.string(),
  drugClass: z.string(),
  timingSensitivity: z.enum(["low", "moderate", "high"]),
  timingRationale: z.string(),
  suggestedWindowMinutes: z
    .number()
    .optional()
    .describe("Default adherence window for reminders only, never a dosing instruction"),
  foodInteractions: z.array(z.string()),
  missedDoseGuidance: z
    .string()
    .describe("Paraphrase of the official label/patient leaflet; say 'ask your pharmacist' if unclear"),
  notableInteractions: z.array(z.string()),
  sources: z.array(source).min(1),
});

export const profileResearchSchema = z.object({
  conditions: z.array(conditionResearchSchema),
  medications: z.array(medicationResearchSchema),
  gaps: z
    .array(z.string())
    .describe("Anything that could not be confirmed from trusted sources"),
});

export type ProfileResearch = z.infer<typeof profileResearchSchema>;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the research component of Cadence, a medication-timing and symptom companion.
Cadence has a wristband (tremor metrics, fall detection, SOS button), a smart pillbox
(lid-open events, LED due/taken/missed reminders) and a web app with voice check-ins,
care-partner alerts (tiers: info, ask, notify, urgent) and clinician summaries.

Given a new user's profile, research each condition and medication with web search and
produce a draft that lets Cadence adapt its check-ins, alerts and reminders.

For each CONDITION find:
- plain-language summary and ICD-10 code if available
- states a patient could self-report in a 30-second check-in
- whether tremor, falls, or sudden shaking are clinically meaningful for it
- fluctuation patterns (time of day, wearing-off, triggers)
- red flags and how urgent each is
- practical care-partner guidance
- metrics clinicians track

For each MEDICATION find (prefer DailyMed / MedlinePlus drug pages):
- class, how timing-sensitive it is and why
- food interactions, missed-dose guidance from the label, notable interactions

Rules:
- Only use the search tool's results; every red flag and timing claim needs a source URL from them.
- Never recommend doses, dose changes or schedules. Reminder windows are defaults for nudges only.
- Do not diagnose. Write for patients and care partners, plainly.
- If something can't be confirmed, leave it out and list it under "gaps".
- When finished researching, call submit_research exactly once with the full result.`;

function describeProfile(p: Profile): string {
  return [
    `Name: ${p.name}`,
    p.age !== undefined ? `Age: ${p.age}` : null,
    `Conditions: ${p.conditions.join(", ") || "none listed"}`,
    `Medications: ${p.medications.map((m) => (m.doseLabel ? `${m.name} (${m.doseLabel})` : m.name)).join(", ") || "none listed"}`,
    p.notes ? `Notes from user/care team: ${p.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

const profileValidator = v.object({
  name: v.string(),
  age: v.optional(v.number()),
  conditions: v.array(v.string()),
  medications: v.array(v.object({ name: v.string(), doseLabel: v.optional(v.string()) })),
  notes: v.optional(v.string()),
});

type Profile = {
  name: string;
  age?: number;
  conditions: string[];
  medications: { name: string; doseLabel?: string }[];
  notes?: string;
};

export const researchProfile = action({
  args: { profile: profileValidator },
  handler: async (_ctx, { profile }) => {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY

    const submitTool: Anthropic.Tool = {
      name: "submit_research",
      description: "Submit the final structured research draft. Call once, at the end.",
      input_schema: z.toJSONSchema(profileResearchSchema) as Anthropic.Tool.InputSchema,
    };

    const tools: Anthropic.Messages.ToolUnion[] = [
      {
        type: WEB_SEARCH_TOOL_TYPE,
        name: "web_search",
        max_uses: MAX_SEARCHES,
        allowed_domains: TRUSTED_DOMAINS,
      } as Anthropic.Messages.ToolUnion,
      submitTool,
    ];

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: `Research this new Cadence user:\n\n${describeProfile(profile)}` },
    ];

    let forceSubmit = false;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        tools,
        messages,
        ...(forceSubmit ? { tool_choice: { type: "tool", name: "submit_research" } } : {}),
      });

      const submission = res.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "submit_research",
      );

      if (submission) {
        const parsed = profileResearchSchema.safeParse(submission.input);
        if (!parsed.success) {
          // Ask Claude to fix its own output once per remaining turn.
          messages.push({ role: "assistant", content: res.content });
          messages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: submission.id,
                is_error: true,
                content: `Schema validation failed, resubmit:\n${z.prettifyError(parsed.error)}`,
              },
            ],
          });
          forceSubmit = true;
          continue;
        }
        return {
          status: "draft" as const,
          model: res.model,
          createdAt: Date.now(),
          research: dropUntrustedSources(parsed.data),
        };
      }

      // Long server-tool runs can pause; resend to let Claude continue.
      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }

      // Finished talking without submitting: nudge it to submit what it found.
      messages.push({ role: "assistant", content: res.content });
      messages.push({
        role: "user",
        content: "Now call submit_research with everything you found. Put unconfirmed items in gaps.",
      });
      forceSubmit = true;
    }

    throw new Error("Research agent did not return a valid result within the turn limit.");
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTrusted(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return TRUSTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Strip any red flag or source whose URL isn't on the allowlist, and record it as a gap. */
function dropUntrustedSources(r: ProfileResearch): ProfileResearch {
  const gaps = [...r.gaps];
  const conditions = r.conditions.map((c) => {
    const redFlags = c.redFlags.filter((f) => {
      const ok = isTrusted(f.sourceUrl);
      if (!ok) gaps.push(`Unverified red flag for ${c.normalizedName}: ${f.signal}`);
      return ok;
    });
    return { ...c, redFlags, sources: c.sources.filter((s) => isTrusted(s.url)) };
  });
  const medications = r.medications.map((m) => ({
    ...m,
    sources: m.sources.filter((s) => isTrusted(s.url)),
  }));
  return { conditions, medications, gaps };
}