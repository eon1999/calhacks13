import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { PatientNotFoundError } from "./agent";
import { CartesiaError } from "./cartesia";
import { ConfigError } from "./config";

// Response headers carrying text alongside the WAV body. Values are URI-encoded.
export const HEADER_TRANSCRIPT = "X-Cadence-Transcript";
export const HEADER_REPLY = "X-Cadence-Reply";
export const HEADER_ACTIONS = "X-Cadence-Actions";
export const HEADER_NUDGE_KEY = "X-Cadence-Nudge-Key";
export const HEADER_EVENT = "X-Cadence-Event";

export const patientIdSchema = z.string().min(1).max(64);
export const sessionIdSchema = z.string().min(1).max(128);

/** Stage durations (ms) for the standard Server-Timing header (visible in devtools). */
export type StageTimings = Partial<Record<"stt" | "llm" | "tts", number>>;

export function serverTiming(timings: StageTimings): string {
  return Object.entries(timings)
    .map(([stage, ms]) => `${stage};dur=${Math.round(ms ?? 0)}`)
    .join(", ");
}

export function audioResponse(
  wav: ArrayBuffer,
  meta: Record<string, string>,
  timings: StageTimings = {},
): Response {
  const headers = new Headers({ "Content-Type": "audio/wav", "Cache-Control": "no-store" });
  for (const [key, value] of Object.entries(meta)) headers.set(key, encodeURIComponent(value));
  const timing = serverTiming(timings);
  if (timing) headers.set("Server-Timing", timing);
  return new Response(wav, { headers });
}

/** Run `fn` and record its duration under `stage`. */
export async function timed<T>(timings: StageTimings, stage: keyof StageTimings, fn: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await fn();
  } finally {
    timings[stage] = performance.now() - started;
  }
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status });
}

/** Map pipeline failures to HTTP responses without leaking upstream details. */
export function handleVoiceError(error: unknown, route: string): Response {
  if (error instanceof z.ZodError) return jsonError(400, "Invalid request");
  if (error instanceof PatientNotFoundError) return jsonError(404, "Patient not found");
  console.error(`[voice] ${route} failed`, error);
  // Env var names aren't secret; surfacing them makes local setup obvious.
  if (error instanceof ConfigError) return jsonError(503, error.message);
  if (error instanceof CartesiaError) return jsonError(502, "Speech service unavailable");
  if (error instanceof Anthropic.APIError) return jsonError(502, "Assistant unavailable");
  // Missing credentials surface as a plain Error from the SDK (no typed class),
  // so this one case is matched on its message.
  if (
    error instanceof Anthropic.AnthropicError ||
    (error instanceof Error && error.message.includes("Could not resolve authentication method"))
  ) {
    return jsonError(
      503,
      "Claude is not configured. Set ANTHROPIC_API_KEY in .env.local or the Vercel project's Environment Variables.",
    );
  }
  // Convex rejects malformed document ids with an ArgumentValidationError.
  if (error instanceof Error && /ArgumentValidationError|Invalid argument/.test(error.message)) {
    return jsonError(400, "Invalid patientId");
  }
  return jsonError(500, "Voice pipeline failed");
}
