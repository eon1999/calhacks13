import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { debugDisabledResponse, debugEnabled } from "@/lib/debug";
import { toE164 } from "@/lib/notify/phone";
import { convex } from "@/lib/voice/convex";
import { handleVoiceError, jsonError, patientIdSchema } from "@/lib/voice/http";

const body = z.object({ patientId: patientIdSchema, phone: z.string().max(32) });

/**
 * Route every alert text for a patient to one test number instead of the care
 * team. JSON body: { patientId, phone }; an empty phone turns it off.
 */
export async function POST(request: Request): Promise<Response> {
  if (!debugEnabled()) return debugDisabledResponse();
  try {
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "Invalid request");
    const phone = parsed.data.phone.trim();
    if (phone && !toE164(phone)) return jsonError(400, `"${phone}" isn't a phone number Cadence can text`);
    const testTextTo = await convex().mutation(api.debug.setTestTextTo, {
      patientId: parsed.data.patientId as Id<"patients">,
      phone,
    });
    return Response.json({ success: true, data: { testTextTo } });
  } catch (error: unknown) {
    return handleVoiceError(error, "debug/test-phone");
  }
}
