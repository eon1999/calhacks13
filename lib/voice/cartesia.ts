import {
  CARTESIA_API_BASE,
  CARTESIA_STT_MODEL,
  CARTESIA_TTS_MODEL,
  CARTESIA_VERSION,
  TTS_SAMPLE_RATE,
  TTS_SPEED,
  cartesiaApiKey,
  cartesiaVoiceId,
} from "./config";
import { fixWavSizes } from "./wav";

export class CartesiaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CartesiaError";
  }
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${cartesiaApiKey()}`,
    "Cartesia-Version": CARTESIA_VERSION,
  };
}

async function failure(res: Response, what: string): Promise<CartesiaError> {
  const body = await res.text().catch(() => "");
  return new CartesiaError(`Cartesia ${what} failed (${res.status}): ${body.slice(0, 300)}`, res.status);
}

/** Speech-to-text. Accepts any container Cartesia supports (wav, webm, ogg, mp3...). */
export async function transcribe(audio: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", CARTESIA_STT_MODEL);
  form.append("language", "en");

  const res = await fetch(`${CARTESIA_API_BASE}/stt`, {
    method: "POST",
    headers: headers(),
    body: form,
  });
  if (!res.ok) throw await failure(res, "STT");

  const json: unknown = await res.json();
  const text =
    typeof json === "object" && json !== null && "text" in json && typeof json.text === "string"
      ? json.text
      : "";
  return text.trim();
}

/** Text-to-speech. Returns a 16 kHz mono 16-bit PCM WAV file. */
export async function synthesize(text: string): Promise<ArrayBuffer> {
  const res = await fetch(`${CARTESIA_API_BASE}/tts/bytes`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: CARTESIA_TTS_MODEL,
      transcript: text,
      voice: { id: cartesiaVoiceId() },
      language: "en",
      output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: TTS_SAMPLE_RATE },
      generation_config: { speed: TTS_SPEED },
    }),
  });
  if (!res.ok) throw await failure(res, "TTS");
  return fixWavSizes(await res.arrayBuffer());
}
