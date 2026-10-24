import { z } from "zod";
import type { DoseSlot } from "../schedule";

// Things the wearable can report that make the agent speak first.
export const wearableEvent = z.enum([
  "dose_due",
  "missed_dose",
  "check_in",
  "low_activity",
  "fall",
  "sos",
  "first_boot",
  "lid_opened", // pillbox opened during a dose window
  "extra_opening", // pillbox opened again after a taken dose
]);
export type WearableEvent = z.infer<typeof wearableEvent>;

export const EVENT_LABELS: Record<WearableEvent, string> = {
  dose_due: "Medication due",
  missed_dose: "Missed dose follow-up",
  check_in: "Scheduled check-in",
  low_activity: "Inactive for hours",
  fall: "Possible fall detected",
  sos: "SOS button pressed",
  first_boot: "First time on the wrist",
  lid_opened: "Pillbox opened",
  extra_opening: "Pillbox opened again",
};

/** Events that are also logged to the `events` table for the care team. */
export const SAFETY_EVENTS = ["fall", "sos"] as const satisfies readonly WearableEvent[];
export type SafetyEvent = (typeof SAFETY_EVENTS)[number];

export function isSafetyEvent(event: WearableEvent): event is SafetyEvent {
  return (SAFETY_EVENTS as readonly WearableEvent[]).includes(event);
}

export type CheckInTrigger = "scheduled" | "low_activity" | "fall" | "manual";

export function checkInTriggerFor(event: WearableEvent | null): CheckInTrigger {
  if (event === "fall") return "fall";
  if (event === "low_activity") return "low_activity";
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
  if (event === "extra_opening") return slots.filter((s) => s.status === "taken");
  if (event === "lid_opened") {
    // The dose the box was opened for: due now, else the latest one not yet confirmed.
    const due = dueSlots(slots);
    if (due.length) return due;
    const latest = slots.filter((s) => s.status === "missed").at(-1);
    return latest ? slots.filter((s) => s.scheduledFor === latest.scheduledFor && s.status !== "taken") : [];
  }
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
    case "low_activity":
      return "[Wearable event] The wristband says they've barely moved in several hours. Ask kindly how they're feeling, and if their care plan allows, encourage a short walk or some ankle pumps to help circulation. Don't push if they're in pain or were told to rest. Then record a check-in.";
    case "fall":
      return "[Wearable event] Possible fall detected by the wristband. Ask right away if they are OK and whether they need help.";
    case "sos":
      return "[Wearable event] The patient pressed the SOS button on the wristband. Alert the care team as urgent right away, tell them help is being notified, and ask what's happening.";
    case "lid_opened":
      return slots.length
        ? `[Wearable event] The pillbox was just opened for: ${listSlots(slots)}. Opening isn't the same as taking. Ask simply whether they've taken them, and call mark_dose_taken only when they say yes.`
        : "[Wearable event] The pillbox was just opened, but no dose is due. Ask kindly if they need anything; don't suggest taking extra medicine.";
    case "extra_opening":
      return slots.length
        ? `[Wearable event] The pillbox was opened again, but these doses were already taken today: ${listSlots(slots)}. Gently remind them they've already had this dose, and that their care team can help if they're unsure. Never tell them to take more. Don't block or scold.`
        : "[Wearable event] The pillbox was opened again after a dose was already taken. Gently remind them they've already had it. Never tell them to take more.";
    case "first_boot":
      return "[Wearable event] The band was just paired and put on for the first time. Introduce yourself in one sentence, then ask whether it's okay for you to let the people listed under Care team know if they fall, miss medicine, or seem unwell, naming those people. When they answer, call record_consent.";
  }
}

/** Stable key so a client only plays one reminder per set of due slots. */
export function nudgeKey(slots: DoseSlot[]): string {
  return slots.map((s) => s.slotId).sort().join(",");
}
