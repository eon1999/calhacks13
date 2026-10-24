import { z } from "zod";
import { debugDisabledResponse, debugEnabled } from "@/lib/debug";
import { e164, placeCall } from "@/lib/phone/calls";
import { CALL_REASONS, callVariables, type CallReason } from "@/lib/phone/script";
import { CartesiaError } from "@/lib/voice/cartesia";
import { ConfigError } from "@/lib/voice/config";
import { jsonError } from "@/lib/voice/http";

const body = z.object({
  toNumber: e164,
  contactName: z.string().trim().min(1).max(100),
  patientName: z.string().trim().min(1).max(100),
  reason: z.enum(Object.keys(CALL_REASONS) as [CallReason, ...CallReason[]]),
  callbackNumber: e164.optional(),
});

/**
 * Place an outbound phone call from the Cartesia phone agent.
 * JSON body: { toNumber, contactName, patientName, reason, callbackNumber? }.
 * Places a real call, so it's gated like the debug tools.
 * TODO(auth): require a signed-in care team member before enabling in production.
 */
export async function POST(request: Request): Promise<Response> {
  if (!debugEnabled()) return debugDisabledResponse();
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request");

  const { toNumber, ...rest } = parsed.data;
  try {
    const { agentCallId } = await placeCall(toNumber, callVariables(rest));
    return Response.json({ success: true, data: { agentCallId } });
  } catch (error: unknown) {
    console.error("[phone] call failed", error);
    // Env var names aren't secret; surfacing them makes local setup obvious.
    if (error instanceof ConfigError) return jsonError(503, error.message);
    if (error instanceof CartesiaError) return jsonError(502, "Phone service unavailable");
    return jsonError(500, "Call failed");
  }
}
