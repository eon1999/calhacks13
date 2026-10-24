import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { debugDisabledResponse, debugEnabled } from "@/lib/debug";
import { convex } from "@/lib/voice/convex";
import { handleVoiceError, jsonError, patientIdSchema } from "@/lib/voice/http";

const body = z.object({
  patientId: patientIdSchema,
  tier: z.enum(["ask", "notify", "urgent"]),
  reason: z.string().min(1).max(300),
});

/**
 * Raise an alert without the agent; it texts like any other alert.
 * JSON body: { patientId, tier, reason }.
 */
export async function POST(request: Request): Promise<Response> {
  if (!debugEnabled()) return debugDisabledResponse();
  try {
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "Invalid request");
    const alertId = await convex().mutation(api.debug.raiseAlert, {
      patientId: parsed.data.patientId as Id<"patients">,
      tier: parsed.data.tier,
      reason: parsed.data.reason,
    });
    return Response.json({ success: true, data: { alertId } });
  } catch (error: unknown) {
    return handleVoiceError(error, "debug/alert");
  }
}
