import { z } from "zod";
import { debugDisabledResponse, debugEnabled } from "@/lib/debug";
import { e164, phoneConfig, placeCall } from "@/lib/phone/calls";
import { CALL_REASONS, callVariables, type CallReason } from "@/lib/phone/script";
import { jsonError } from "@/lib/voice/http";

const body = z.object({
  toNumber: e164,
  contactName: z.string().trim().min(1).max(100),
  patientName: z.string().trim().min(1).max(100),
  reason: z.enum(Object.keys(CALL_REASONS) as [CallReason, ...CallReason[]]),
  callbackNumber: e164.optional(),
});

/**
 * Place a test call from the Cartesia phone agent. (Urgent alerts call on their
 * own from Convex: convex/phone.ts.)
 * JSON body: { toNumber, contactName, patientName, reason, callbackNumber? }.
 * Places a real call, so it's gated like the debug tools.
 * TODO(auth): require a signed-in care team member before enabling in production.
 */
export async function POST(request: Request): Promise<Response> {
  if (!debugEnabled()) return debugDisabledResponse();
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request");

  const config = phoneConfig(process.env);
  if (!config) {
    return jsonError(
      503,
      "Phone calls aren't set up. Set CARTESIA_API_KEY, CARTESIA_PHONE_AGENT_ID and CARTESIA_FROM_NUMBER_ID in .env.local.",
    );
  }

  const { toNumber, ...rest } = parsed.data;
  const result = await placeCall(config, toNumber, callVariables(rest));
  if (!result.ok) {
    console.error("[phone] call failed", result.error);
    return jsonError(502, "Phone service unavailable");
  }
  return Response.json({ success: true, data: { agentCallId: result.agentCallId } });
}
