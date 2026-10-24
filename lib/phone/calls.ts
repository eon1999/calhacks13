import { z } from "zod";
import type { CallVariables } from "./script";

// Outbound phone calls through a Cartesia voice agent (POST /agents/calls).
// Docs: https://docs.cartesia.ai/2026-03-01/api-reference/agents/calls/create-outbound-call
// Plain fetch, no SDK, so it runs in Next.js route handlers and Convex actions alike.
// Settings come from the environment (Convex env vars for urgent-alert calls):
//   CARTESIA_API_KEY, CARTESIA_PHONE_AGENT_ID, CARTESIA_FROM_NUMBER_ID

const CARTESIA_API_BASE = "https://api.cartesia.ai";
// The outbound-calls endpoint is documented under this API version.
export const PHONE_API_VERSION = "2026-03-01";
export const RINGING_TIMEOUT_SECONDS = 30; // Cartesia allows 5–80
export const MAX_CALL_MINUTES = 5;

/** E.164, e.g. +14155559876. Cartesia-managed numbers only dial US destinations. */
export const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/, "Use E.164 format, e.g. +14155559876");

export interface PhoneConfig {
  apiKey: string;
  /** The agent built in the Cartesia dashboard (paste lib/phone/script.ts into it). */
  agentId: string;
  /** ID of the Cartesia phone number calls come from (not the number itself). */
  fromNumberId: string;
}

/** Cartesia phone settings from the environment, or null when calling isn't set up (dry run). */
export function phoneConfig(env: Record<string, string | undefined>): PhoneConfig | null {
  const apiKey = env.CARTESIA_API_KEY;
  const agentId = env.CARTESIA_PHONE_AGENT_ID;
  const fromNumberId = env.CARTESIA_FROM_NUMBER_ID;
  if (!apiKey || !agentId || !fromNumberId) return null;
  return { apiKey, agentId, fromNumberId };
}

export interface OutboundCallRequest {
  from_number_id: string;
  agent_id: string;
  ringing_timeout_seconds: number;
  max_call_duration_minutes: number;
  outbound_calls: { to_number: string; dynamic_variables: CallVariables }[];
}

/** Request body for one outbound call. Pure, so it's easy to test. */
export function buildOutboundCallRequest(args: {
  agentId: string;
  fromNumberId: string;
  toNumber: string;
  variables: CallVariables;
}): OutboundCallRequest {
  return {
    from_number_id: args.fromNumberId,
    agent_id: args.agentId,
    ringing_timeout_seconds: RINGING_TIMEOUT_SECONDS,
    max_call_duration_minutes: MAX_CALL_MINUTES,
    outbound_calls: [{ to_number: e164.parse(args.toNumber), dynamic_variables: args.variables }],
  };
}

const callResponse = z.object({
  calls: z.array(
    z.object({
      number: z.string(),
      agent_call_id: z.string().optional(),
      error: z.unknown().optional(),
    }),
  ),
});

export type CallResult = { ok: true; agentCallId: string } | { ok: false; error: string };

/** Place one call. Never throws: failures come back as { ok: false } for logging. */
export async function placeCall(config: PhoneConfig, toNumber: string, variables: CallVariables): Promise<CallResult> {
  try {
    const body = buildOutboundCallRequest({
      agentId: config.agentId,
      fromNumberId: config.fromNumberId,
      toNumber,
      variables,
    });
    const res = await fetch(`${CARTESIA_API_BASE}/agents/calls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Cartesia-Version": PHONE_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Cartesia ${res.status}: ${text.slice(0, 300)}` };
    }
    // Each destination succeeds or fails on its own, so check the entry, not just the status.
    const [call] = callResponse.parse(await res.json()).calls;
    if (!call?.agent_call_id) {
      return { ok: false, error: `Cartesia could not start the call: ${JSON.stringify(call?.error ?? "no result")}` };
    }
    return { ok: true, agentCallId: call.agent_call_id };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
