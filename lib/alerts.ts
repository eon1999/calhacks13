// Alert kinds and routing. Shared by Convex (who raises what) and the web app
// (who sees what). Pure: no I/O.

export type AlertTier = "info" | "ask" | "notify" | "urgent";

export const ALERT_KINDS = [
  // "ask" tier: prompts the patient's band/hub speaks.
  "dose_reminder", // at T and T+15
  "dose_confirm", // lid opened: "did you take them?"
  "extra_opening_prompt", // lid opened again after a taken dose
  "fall_check", // "are you okay?"
  "sos_prompt",
  "low_activity", // long stillness: gentle nudge to move
  "check_in", // phase-based scheduled check-in (lib/voice/events.ts)
  // "notify" / "urgent" tier: the care team.
  "missed_dose",
  "extra_opening",
  "fall_unanswered",
  "sos",
  "red_flag",
  "struggling_twice",
  "device_offline",
  "consent",
  "voice_agent", // raised by the agent's alert_care_team tool
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** Patient prompts, and the wearable event (lib/voice/events.ts) the hub nudges with. */
export const PROMPT_EVENTS = {
  dose_reminder: "dose_due",
  dose_confirm: "lid_opened",
  extra_opening_prompt: "extra_opening",
  fall_check: "fall",
  sos_prompt: "sos",
  low_activity: "low_activity",
  check_in: "check_in",
} as const satisfies Partial<Record<AlertKind, string>>;
export type PromptKind = keyof typeof PROMPT_EVENTS;

export function isPromptKind(kind: string | undefined): kind is PromptKind {
  return !!kind && kind in PROMPT_EVENTS;
}

/** Prompts older than this aren't spoken any more (the moment has passed). */
export const PROMPT_TTL_MS = 10 * 60_000;

/**
 * Whether the care team should see this alert in their list. Patient prompts
 * stay on the band; everything else (including "ask" alerts aimed at the
 * family, like a declined consent) shows.
 */
export function isCareAlert(alert: { tier: AlertTier; kind?: string }): boolean {
  if (alert.tier === "info") return false;
  return !isPromptKind(alert.kind);
}

export const TIER_LABELS: Record<AlertTier, string> = {
  info: "For the record",
  ask: "Worth a check-in",
  notify: "Needs a look",
  urgent: "Urgent",
};

/** Higher sorts first. */
export const TIER_RANK: Record<AlertTier, number> = { urgent: 3, notify: 2, ask: 1, info: 0 };

/** Dedup window for urgent alerts (the device and the voice agent can both raise one). */
export const URGENT_DEDUP_MS = 2 * 60_000;
