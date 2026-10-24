// Voice agent configuration. Server-only: reads secrets from process.env.

// Claude Sonnet 5.5 at low effort: check-ins and reminders are short,
// conversational turns where latency matters more than deep reasoning.
export const CLAUDE_MODEL = "claude-sonnet-5-5";
export const CLAUDE_EFFORT = "low" as const;
export const CLAUDE_MAX_TOKENS = 4096;
// Safety net for runaway tool loops within a single spoken turn.
export const MAX_TOOL_ROUNDS = 5;

export const CARTESIA_API_BASE = "https://api.cartesia.ai";
export const CARTESIA_VERSION = "2026-08-14";
export const CARTESIA_TTS_MODEL = "sonic-3.6";
export const CARTESIA_STT_MODEL = "ink-whisper";
// Default Cartesia voice; override with CARTESIA_VOICE_ID to pick a warmer one.
const DEFAULT_VOICE_ID = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4";

// 16 kHz mono 16-bit PCM WAV: small, and trivially playable over I2S on the
// wearable's MCU as well as in the browser simulator.
export const TTS_SAMPLE_RATE = 16_000;
// Slightly slower speech for older listeners (Cartesia range 0.6–1.5).
export const TTS_SPEED = 0.9;

// Upper bound on uploaded audio per turn (~60 s of 16 kHz PCM is ~2 MB).
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ConfigError(`${name} is not set. Add it to .env.local.`);
  return value;
}

export function cartesiaApiKey(): string {
  return requireEnv("CARTESIA_API_KEY");
}

export function cartesiaVoiceId(): string {
  return process.env.CARTESIA_VOICE_ID || DEFAULT_VOICE_ID;
}

export function convexUrl(): string {
  return requireEnv("NEXT_PUBLIC_CONVEX_URL");
}
