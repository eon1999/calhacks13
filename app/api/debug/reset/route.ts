import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { debugDisabledResponse, debugEnabled } from "@/lib/debug";
import { convex } from "@/lib/voice/convex";
import { handleVoiceError, jsonError, patientIdSchema } from "@/lib/voice/http";

const body = z.object({ patientId: patientIdSchema });

/**
 * Clear today's test data for a patient (doses taken, check-ins, alerts,
 * fall/SOS events, voice history). JSON body: { patientId }.
 */
export async function POST(request: Request): Promise<Response> {
  if (!debugEnabled()) return debugDisabledResponse();
  try {
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "Invalid request");
    const deleted = await convex().mutation(api.debug.resetToday, {
      patientId: parsed.data.patientId as Id<"patients">,
      now: Date.now(),
    });
    return Response.json({ success: true, data: { deleted } });
  } catch (error: unknown) {
    return handleVoiceError(error, "debug/reset");
  }
}
