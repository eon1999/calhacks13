import { z } from "zod";
import { SCAN_MEDIA_TYPES, scanMedicationLabel, UnreadableLabelError } from "@/lib/onboarding/med-scan";
import { handleVoiceError, jsonError } from "@/lib/voice/http";

export const maxDuration = 60;

// The wizard downscales photos before upload; this stays under Vercel's 4.5 MB body cap.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const scanRequest = z.object({
  image: z.string().min(1).max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3)),
  mediaType: z.enum(SCAN_MEDIA_TYPES),
});

/**
 * POST { image: base64 (no data: prefix), mediaType } → { success, data: ScannedMedication }
 * Reads a medicine label photo into the setup wizard's medication form.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { image, mediaType } = scanRequest.parse(await request.json());
    const data = await scanMedicationLabel(image, mediaType);
    return Response.json({ success: true, data });
  } catch (error: unknown) {
    if (error instanceof UnreadableLabelError) return jsonError(422, error.message);
    if (error instanceof SyntaxError) return jsonError(400, "Invalid request");
    return handleVoiceError(error, "scan-med");
  }
}
