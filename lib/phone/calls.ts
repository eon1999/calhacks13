import { z } from "zod";
import { CartesiaError } from "../voice/cartesia";
import { CARTESIA_API_BASE, ConfigError, cartesiaApiKey } from "../voice/config";
import type { CallVariables } from "./script";

// Outbound phone calls through a Cartesia voice agent (POST /agents/calls).
// Docs: https://docs.cartesia.ai/2026-03-01/api-reference/agents/calls/create-outbound-call
// Server-only: reads secrets from process.env.

// The outbound-calls endpoint is documented under this API version.
export const PHONE_API_VERSION = "2026-03-01";
export const RINGING_TIMEOUT_SECONDS = 30; // Cartesia allows 5–80
export const MAX_CALL_MINUTES = 5;

/** E.164, e.g. +14155559876. Cartesia-managed numbers only dial US destinations. */
export const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/, "Use E.164 format, e.g. +14155559876");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ConfigError(`${name} is not set. Add it to .env.local.`);
  return value;
}

/** The agent built in the Cartesia dashboard (paste lib/phone/script.ts into it). */
export function phoneAgentId(): string {
  return requireEnv("CARTESIA_PHONE_AGENT_ID");
}

/** ID of the Cartesia phone number calls come from (not the number itself). */
export function fromNumberId(): string {
  return requireEnv("CARTESIA_FROM_NUMBER_ID");
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

/** Place one call. Returns Cartesia's call id; throws CartesiaError if the call couldn't start. */
export async function placeCall(toNumber: string, variables: CallVariables): Promise<{ agentCallId: string }> {
  const body = buildOutboundCallRequest({ agentId: phoneAgentId(), fromNumberId: fromNumberId(), toNumber, variables });

  const res = await fetch(`${CARTESIA_API_BASE}/agents/calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cartesiaApiKey()}`,
      "Cartesia-Version": PHONE_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new CartesiaError(`Cartesia call failed (${res.status}): ${text.slice(0, 300)}`, res.status);
  }

  // Each destination succeeds or fails on its own, so check the entry, not just the status.
  const [call] = callResponse.parse(await res.json()).calls;
  if (!call?.agent_call_id) {
    throw new CartesiaError(`Cartesia could not start the call: ${JSON.stringify(call?.error ?? "no result")}`, 502);
  }
  return { agentCallId: call.agent_call_id };
}
