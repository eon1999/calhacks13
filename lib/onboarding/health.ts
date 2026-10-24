import { z } from "zod";

// Health background captured during onboarding: other conditions, allergies and
// how they get around. Shared by the setup wizard, Convex, and the voice
// agent's system prompt.

export const COMMON_CONDITIONS = [
  "High blood pressure",
  "Diabetes",
  "Heart disease",
  "Atrial fibrillation",
  "COPD or asthma",
  "Kidney disease",
  "Arthritis",
  "Osteoporosis",
  "Sleep apnea",
  "Memory loss or dementia",
  "Depression or anxiety",
  "Parkinson's",
] as const;

export const COMMON_ALLERGIES = [
  "Penicillin",
  "Sulfa drugs",
  "Codeine or opioids",
  "Ibuprofen or NSAIDs",
  "Aspirin",
  "Latex",
  "Adhesive tape",
] as const;

export const MOBILITY = [
  {
    id: "independent",
    label: "On their own",
    body: "Walks without help.",
    focus: null,
  },
  {
    id: "cane",
    label: "With a cane",
    body: "Steady most of the time.",
    focus: "Uses a cane; remind them to keep it within reach when getting up.",
  },
  {
    id: "walker",
    label: "With a walker",
    body: "Needs support for every step.",
    focus: "Uses a walker and is at higher risk of falling; encourage them to take their time and use it every time.",
  },
  {
    id: "wheelchair",
    label: "Wheelchair",
    body: "Mostly seated or bed-bound.",
    focus: "Uses a wheelchair; ask about comfort, pressure sores and gentle movement rather than walking.",
  },
] as const;

export type MobilityId = (typeof MOBILITY)[number]["id"];
export const mobilityId = z.enum(MOBILITY.map((m) => m.id) as [MobilityId, ...MobilityId[]]);

export const MAX_HEALTH_ITEMS = 20;

export interface HealthProfile {
  conditions: string[];
  allergies: string[];
  noKnownAllergies?: boolean;
  mobility?: string;
  notes?: string;
}

export function mobilityInfo(id: string | undefined) {
  return MOBILITY.find((m) => m.id === id) ?? null;
}

/** "2 conditions · no known allergies" for the setup summary. */
export function healthSummary(h: HealthProfile | undefined): string {
  if (!h) return "Not shared";
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    h.conditions.length ? count(h.conditions.length, "condition", "conditions") : null,
    h.noKnownAllergies
      ? "no known allergies"
      : h.allergies.length
        ? count(h.allergies.length, "allergy", "allergies")
        : null,
    mobilityInfo(h.mobility)?.label.toLowerCase() ?? null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Not shared";
}
