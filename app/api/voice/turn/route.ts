import type { Id } from "@/convex/_generated/dataModel";
import { runAgentTurn } from "@/lib/voice/agent";
import { synthesize, transcribe } from "@/lib/voice/cartesia";
import { MAX_AUDIO_BYTES } from "@/lib/voice/config";
import {
  HEADER_ACTIONS,
  HEADER_REPLY,
  HEADER_TRANSCRIPT,
  audioResponse,
  handleVoiceError,
  jsonError,
  patientIdSchema,
  sessionIdSchema,
  timed,
  type StageTimings,
} from "@/lib/voice/http";

export const maxDuration = 60;

const NOTHING_HEARD_REPLY = "I didn't hear anything. Tap the button and talk to me whenever you're ready.";

function audioFilename(file: File): string {
  if (file.name && file.name !== "blob") return file.name;
  if (file.type.includes("webm")) return "audio.webm";
  if (file.type.includes("ogg")) return "audio.ogg";
  if (file.type.includes("mp4")) return "audio.mp4";
  return "audio.wav";
}

/**
 * One spoken turn from the wearable (or the /hub simulator).
 *
 * multipart/form-data:
 *   patientId  Convex patients id
 *   sessionId  conversation id chosen by the device
 *   audio      recorded speech (wav/webm/ogg/mp3...)   — or —
 *   text       already-transcribed speech (for testing)
 *
 * Responds with audio/wav (16 kHz mono s16le) plus X-Cadence-* headers.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const patientId = patientIdSchema.parse(form.get("patientId")) as Id<"patients">;
    const sessionId = sessionIdSchema.parse(form.get("sessionId"));
    const audio = form.get("audio");
    const typed = form.get("text");

    const timings: StageTimings = {};
    let transcript: string;
    if (audio instanceof File && audio.size > 0) {
      if (audio.size > MAX_AUDIO_BYTES) return jsonError(413, "Audio too large");
      transcript = await timed(timings, "stt", () => transcribe(audio, audioFilename(audio)));
    } else if (typeof typed === "string") {
      transcript = typed.trim().slice(0, 2000);
    } else {
      return jsonError(400, "Provide audio or text");
    }

    if (!transcript) {
      return audioResponse(await synthesize(NOTHING_HEARD_REPLY), {
        [HEADER_TRANSCRIPT]: "",
        [HEADER_REPLY]: NOTHING_HEARD_REPLY,
        [HEADER_ACTIONS]: "",
      });
    }

    const { reply, actions, llmMs } = await runAgentTurn({
      patientId,
      sessionId,
      input: { kind: "speech", text: transcript },
    });
    timings.llm = llmMs;
    const wav = await timed(timings, "tts", () => synthesize(reply));

    return audioResponse(
      wav,
      {
        [HEADER_TRANSCRIPT]: transcript,
        [HEADER_REPLY]: reply,
        [HEADER_ACTIONS]: actions.join(","),
      },
      timings,
    );
  } catch (error: unknown) {
    return handleVoiceError(error, "turn");
  }
}
