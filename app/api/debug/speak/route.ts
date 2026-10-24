import { z } from "zod";
import { debugDisabledResponse, debugEnabled } from "@/lib/debug";
import { synthesize } from "@/lib/voice/cartesia";
import { HEADER_REPLY, audioResponse, handleVoiceError, jsonError } from "@/lib/voice/http";

const body = z.object({ text: z.string().trim().min(1).max(500) });

/**
 * Test voice message: speak arbitrary text through the wearable's TTS voice,
 * bypassing Claude. Checks the speaker/voice path in isolation.
 * JSON body: { text }. Responds with audio/wav.
 */
export async function POST(request: Request): Promise<Response> {
  if (!debugEnabled()) return debugDisabledResponse();
  try {
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "Provide text (1–500 characters)");
    return audioResponse(await synthesize(parsed.data.text), { [HEADER_REPLY]: parsed.data.text });
  } catch (error: unknown) {
    return handleVoiceError(error, "debug/speak");
  }
}
