import { z } from "zod";
import type { DoseSlot } from "../schedule";

// Things the wearable can report that make the agent speak first.
export const wearableEvent = z.enum([
  "dose_due",
  "missed_dose",
  "check_in",
  "tremor_spike",
  "fall",
  "sos",
]);
export type WearableEvent = z.infer<typeof wearableEvent>;

export const EVENT_LABELS: Record<WearableEvent, string> = {
  dose_due: "Medication due",
  missed_dose: "Missed dose follow-up",
  check_in: "Scheduled check-in",
  tremor_spike: "Tremor spike detected",
  fall: "Possible fall detected",
  sos: "SOS button pressed",
};

/** Events that are also logged to the `events` table for the care team. */
export const SAFETY_EVENTS = ["fall", "sos"] as const satisfies readonly WearableEvent[];
export type SafetyEvent = (typeof SAFETY_EVENTS)[number];

export function isSafetyEvent(event: WearableEvent): event is SafetyEvent {
  return (SAFETY_EVENTS as readonly WearableEvent[]).includes(event);
}

export type CheckInTrigger = "scheduled" | "tremor_spike" | "fall" | "manual";

export function checkInTriggerFor(event: WearableEvent | null): CheckInTrigger {
  if (event === "fall") return "fall";
  if (event === "tremor_spike") return "tremor_spike";
  if (event === "check_in") return "scheduled";
  return "manual";
}

/** Dose slots that should trigger a proactive reminder right now. */
export function dueSlots(slots: DoseSlot[]): DoseSlot[] {
  return slots.filter((s) => s.status === "due");
}

/**
 * Slots a dose event is about. A forced "dose_due" (debug button) with nothing
 * actually due falls back to the next upcoming dose, else the latest missed one,
 * so the reminder always names a real medication.
 */
export function slotsForEvent(event: WearableEvent, slots: DoseSlot[]): DoseSlot[] {
  if (event === "missed_dose") return slots.filter((s) => s.status === "missed");
  if (event !== "dose_due") return [];

  const due = dueSlots(slots);
  if (due.length) return due;
  const next = slots.find((s) => s.status === "upcoming");
  const fallback = next ?? slots.filter((s) => s.status === "missed").at(-1);
  if (!fallback) return [];
  // Doses scheduled at the same time are reminded together.
  return slots.filter((s) => s.scheduledFor === fallback.scheduledFor && s.status !== "taken");
}

function listSlots(slots: DoseSlot[]): string {
  return slots.map((s) => `${s.name} (${s.doseLabel}) at ${s.time}`).join("; ");
}

/** The line Claude sees (as user-side context) when the wearable starts a conversation. */
export function describeEvent(event: WearableEvent, slots: DoseSlot[]): string {
  switch (event) {
    case "dose_due":
      return slots.length
        ? `[Wearable event] Medication reminder: ${listSlots(slots)}. Remind the patient and ask them to tell you once they've taken it.`
        : "[Wearable event] Medication reminder, but every dose today is already taken. Let the patient know they're all caught up.";
    case "missed_dose":
      return slots.length
        ? `[Wearable event] These doses were not confirmed in their window: ${listSlots(slots)}. Gently ask whether they took them. Do not tell them to double up; if they're unsure, suggest checking with their care team.`
        : "[Wearable event] Missed-dose check, but no doses are missed today. Briefly reassure the patient they're on track.";
    case "check_in":
      return "[Wearable event] Scheduled check-in. Ask the patient how they're feeling and moving right now.";
    case "tremor_spike":
      return "[Wearable event] The wristband measured a tremor much stronger than the patient's usual. Calmly ask how they're feeling and whether they're more shaky or stiff than usual, then record a check-in.";
    case "fall":
      return "[Wearable event] Possible fall detected by the wristband. Ask right away if they are OK and whether they need help.";
    case "sos":
      return "[Wearable event] The patient pressed the SOS button on the wristband. Alert the care team as urgent right away, tell them help is being notified, and ask what's happening.";
  }
}

/** Stable key so a client only plays one reminder per set of due slots. */
export function nudgeKey(slots: DoseSlot[]): string {
  return slots.map((s) => s.slotId).sort().join(",");
}
