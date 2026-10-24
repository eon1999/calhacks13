"use node";

/**
 * convex/agent.ts
 *
 * Watch-list research agent. Once a patient is set up, Claude searches a fixed
 * allowlist of trusted medical sources and returns what the band should watch
 * for in heart rate, temperature and movement for this patient's surgery,
 * conditions and medicines. Results land in `watchLists` (convex/watchList.ts).
 *
 * The output is a DRAFT for the care team, not medical advice. It never sets
 * doses or schedules.
 *
 * Setup:  npx convex env set ANTHROPIC_API_KEY sk-ant-...
 * Start:  api.watchList.request({ patientId })  (schedules researchWatchList)
 */

import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { watchListSchema, type WatchList } from "../lib/watch-list";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MODEL = "claude-opus-5-5";
const MAX_SEARCHES = 8;
const MAX_TURNS = 6; // guards the pause_turn / resubmit loop

const TRUSTED_DOMAINS = [
  "medlineplus.gov",
  "nih.gov", // covers ncbi.nlm.nih.gov, dailymed.nlm.nih.gov
  "cdc.gov",
  "fda.gov",
  "nhs.uk",
  "nice.org.uk",
  "who.int",
  "mayoclinic.org",
  "clevelandclinic.org",
  "hopkinsmedicine.org",
  "heart.org",
  "aaos.org", // orthoinfo.aaos.org
  "facs.org",
];

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You research what a wristband should watch for in a person recovering at home after surgery.
The band measures heart rate, skin temperature and movement (steps, active minutes, falls, sudden shaking, long stillness).
Its alerts to the care team have tiers: info, ask (check in with the patient), notify (tell the care team), urgent.

Use web search to find, for THIS patient's surgery, recovery day, conditions and medicines:
- heart rate: typical resting range, and readings or patterns worth flagging (e.g. sustained fast heart rate as a sign of infection, bleeding, a clot or dehydration; slow heart rate on beta blockers)
- temperature: typical range, and fever thresholds that matter after this surgery and when
- movement: falls, long inactivity (clot risk), sudden shaking, unsteadiness, or new tremor, including medicine side effects (opioids, sedatives, blood pressure drugs)

Rules:
- Be brief. This is shown on a small card: at most 3 signals per area, only the ones that matter most for this patient.
- Signal names are 2-6 words. Thresholds are terse device checks (">100 bpm for 10+ min", "<96.8 °F", "no steps for 3 h while awake").
- The summary is one sentence. List only the sources you actually cite.
- Gaps: at most 3, each under 12 words. Skip device-setting caveats.
- Every signal needs a source URL taken from your search results.
- Do not diagnose and never recommend doses or dose changes.
- If something can't be confirmed from the sources, leave it out and list it under "gaps".
- When finished, call submit_watch_list exactly once with the full result.`;

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export const researchWatchList = internalAction({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    const profile = await ctx.runQuery(internal.watchList.profileFor, { patientId });
    if (!profile) return;
    try {
      const { result, model } = await research(profile.description);
      await ctx.runMutation(internal.watchList.complete, { patientId, result, model });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[watchList] research failed", message);
      await ctx.runMutation(internal.watchList.fail, { patientId, error: message.slice(0, 500) });
    }
  },
});

async function research(description: string): Promise<{ result: WatchList; model: string }> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  const tools: Anthropic.Beta.BetaToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES, allowed_domains: TRUSTED_DOMAINS },
    {
      name: "submit_watch_list",
      description: "Submit the final watch list. Call once, at the end.",
      strict: true,
      input_schema: strictJsonSchema(watchListSchema) as Anthropic.Beta.BetaTool.InputSchema,
    },
  ];

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Research what to watch for in this patient:\n\n${description}` },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // re-run on a fallback model if a safety classifier declines
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    if (res.stop_reason === "refusal") {
      throw new Error(`Research was declined (${res.stop_details?.category ?? "no category"})`);
    }

    // Append the whole turn unchanged: thinking and search blocks must be replayed as-is.
    messages.push({ role: "assistant", content: res.content });

    const submission = res.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "submit_watch_list",
    );
    if (submission) {
      const parsed = watchListSchema.safeParse(submission.input);
      if (parsed.success) return { result: keepTrustedSources(parsed.data), model: res.model };
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: submission.id,
            is_error: true,
            content: `Validation failed, resubmit:\n${z.prettifyError(parsed.error)}`,
          },
        ],
      });
      continue;
    }

    // Long server-tool runs can pause; resend so Claude continues where it left off.
    if (res.stop_reason === "pause_turn") continue;

    // Finished talking without submitting: ask for the submission.
    messages.push({
      role: "user",
      content: "Now call submit_watch_list with what you found. Put anything unconfirmed under gaps.",
    });
  }

  throw new Error("Research agent did not return a watch list within the turn limit.");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strict tool schemas need every object closed and every property required. */
function strictJsonSchema(schema: z.ZodType): unknown {
  const close = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(close);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(node)) {
      if (k !== "$schema") out[k] = close(val);
    }
    if (out.type === "object" && out.properties && typeof out.properties === "object") {
      out.additionalProperties = false;
      out.required = Object.keys(out.properties);
    }
    return out;
  };
  return close(z.toJSONSchema(schema));
}

function isTrusted(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return TRUSTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Drop any signal or source whose URL isn't on the allowlist, and note it as a gap. */
function keepTrustedSources(r: WatchList): WatchList {
  const gaps = [...r.gaps];
  const filter = (area: string, signals: WatchList["heartRate"]["watchFor"]) =>
    signals.filter((s) => {
      const ok = isTrusted(s.sourceUrl);
      if (!ok) gaps.push(`Unverified ${area} signal: ${s.signal}`);
      return ok;
    });
  return {
    ...r,
    heartRate: { ...r.heartRate, watchFor: filter("heart rate", r.heartRate.watchFor) },
    temperature: { ...r.temperature, watchFor: filter("temperature", r.temperature.watchFor) },
    movement: { watchFor: filter("movement", r.movement.watchFor) },
    sources: r.sources.filter((s) => isTrusted(s.url)),
    gaps,
  };
}
