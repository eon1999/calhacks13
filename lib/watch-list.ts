import { z } from "zod";

// What the band should watch for, researched per patient by convex/agent.ts.
// Shared by the agent (validation), Convex (storage) and the /hub UI.

export const alertTier = z.enum(["info", "ask", "notify", "urgent"]);

export const watchSignal = z.object({
  signal: z.string().describe("What to watch for, 2-6 words, e.g. 'Fast resting heart rate'"),
  threshold: z.string().describe("Short device check, e.g. '>100 bpm for 10+ min'"),
  tier: alertTier,
  sourceUrl: z.string(),
});

export const watchListSchema = z.object({
  summary: z.string().describe("One plain sentence, under 25 words, on what matters most"),
  heartRate: z.object({
    typicalRestingRange: z.string().describe("e.g. '60-100 bpm'"),
    watchFor: z.array(watchSignal),
  }),
  temperature: z.object({
    typicalRange: z.string().describe("e.g. '97-99 °F (36.1-37.2 °C)'"),
    watchFor: z.array(watchSignal),
  }),
  movement: z.object({
    watchFor: z.array(watchSignal),
  }),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  gaps: z.array(z.string()).describe("Short notes on anything that could not be confirmed; empty if none"),
});

export type WatchList = z.infer<typeof watchListSchema>;
export type WatchSignal = z.infer<typeof watchSignal>;
