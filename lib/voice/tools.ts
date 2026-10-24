import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { checkInState } from "../schemas";
import { parseSlotId, type DoseSlot } from "../schedule";
import { convex } from "./convex";
import type { CheckInTrigger } from "./events";

export const voiceTools: Anthropic.Beta.BetaTool[] = [
  {
    name: "mark_dose_taken",
    description:
      "Record that the patient took a scheduled medication dose. Only call this after the patient clearly says they took it. Use the slot_id from today's schedule.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        slot_id: { type: "string", description: "slot_id from today's schedule" },
      },
      required: ["slot_id"],
      additionalProperties: false,
    },
  },
  {
    name: "record_check_in",
    description:
      "Save the result of a how-are-you check-in once you have enough to assess how their recovery is going.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: "string",
          enum: checkInState.options,
          description:
            "doing_well (comfortable, getting around, eating and sleeping okay); sore_but_managing (pain or stiffness the current plan keeps under control); struggling (pain not controlled, very tired, not eating or sleeping, low mood); unsure",
        },
        pain_score: {
          type: ["integer", "null"],
          description: "Pain from 0 (none) to 10 (worst) if they gave a number or a clear description; null if not discussed.",
        },
        notes: { type: "string", description: "One short sentence, in the patient's words where possible." },
        red_flag: {
          type: "boolean",
          description:
            "True for a fall, fever or chills, a wound that is red, hot, swollen or leaking, calf pain or swelling, shortness of breath, pain much worse than before, or anything else the care team should see soon.",
        },
      },
      required: ["state", "pain_score", "notes", "red_flag"],
      additionalProperties: false,
    },
  },
  {
    name: "alert_care_team",
    description:
      "Notify the patient's care partner and clinicians. Use 'urgent' for falls, emergencies, or explicit requests for help; 'notify' for concerns that should be seen today.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        tier: { type: "string", enum: ["notify", "urgent"] },
        reason: { type: "string", description: "Short reason the care team will read." },
      },
      required: ["tier", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "record_consent",
    description:
      "Save the patient's answer to whether Cadence may keep their care team updated. Call once, after they answer the first-boot question.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        agreed: { type: "boolean", description: "True only if they clearly said yes." },
        notes: { type: "string", description: "Their answer in a few words, e.g. 'yes, but not my son'." },
      },
      required: ["agreed", "notes"],
      additionalProperties: false,
    },
  },
];

const markDoseTakenInput = z.object({ slot_id: z.string() });
const recordCheckInInput = z.object({
  state: checkInState,
  pain_score: z.number().int().min(0).max(10).nullable(),
  notes: z.string().max(500),
  red_flag: z.boolean(),
});
const recordConsentInput = z.object({ agreed: z.boolean(), notes: z.string().max(300) });
const alertCareTeamInput = z.object({
  tier: z.enum(["notify", "urgent"]),
  reason: z.string().min(1).max(500),
});

export interface ToolContext {
  patientId: Id<"patients">;
  slots: DoseSlot[];
  checkInTrigger: CheckInTrigger;
  /** Conversation so far, saved alongside check-ins for the care team. */
  transcript: () => string;
}

export interface ToolOutcome {
  content: string;
  isError: boolean;
}

async function markDoseTaken(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const { slot_id } = markDoseTakenInput.parse(input);
  const slot = ctx.slots.find((s) => s.slotId === slot_id);
  const parsed = parseSlotId(slot_id);
  if (!slot || !parsed) {
    return { content: `Unknown slot_id "${slot_id}". Use a slot_id from today's schedule.`, isError: true };
  }
  await convex().mutation(api.voice.confirmDose, {
    patientId: ctx.patientId,
    medicationId: parsed.medicationId as Id<"medications">,
    scheduledFor: parsed.scheduledFor,
  });
  return { content: `Marked ${slot.name} (${slot.time}) as taken.`, isError: false };
}

async function recordCheckIn(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const { state, pain_score, notes, red_flag } = recordCheckInInput.parse(input);
  await convex().mutation(api.voice.recordCheckIn, {
    patientId: ctx.patientId,
    trigger: ctx.checkInTrigger,
    transcript: ctx.transcript(),
    state,
    painScore: pain_score ?? undefined,
    notes,
    redFlag: red_flag,
  });
  return {
    content: red_flag ? "Check-in saved and the care team was notified." : "Check-in saved.",
    isError: false,
  };
}

async function alertCareTeam(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const { tier, reason } = alertCareTeamInput.parse(input);
  await convex().mutation(api.voice.createAlert, { patientId: ctx.patientId, tier, reason });
  return { content: `Care team alerted (${tier}).`, isError: false };
}

async function recordConsent(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const { agreed, notes } = recordConsentInput.parse(input);
  await convex().mutation(api.voice.recordConsent, { patientId: ctx.patientId, agreed, notes });
  return {
    content: agreed ? "Consent saved." : "Saved. The family will be asked to talk it through; nothing is switched off.",
    isError: false,
  };
}

const handlers: Record<string, (input: unknown, ctx: ToolContext) => Promise<ToolOutcome>> = {
  mark_dose_taken: markDoseTaken,
  record_check_in: recordCheckIn,
  alert_care_team: alertCareTeam,
  record_consent: recordConsent,
};

export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const handler = handlers[name];
  if (!handler) return { content: `Unknown tool "${name}".`, isError: true };
  try {
    return await handler(input, ctx);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return { content: `Invalid input: ${error.message}`, isError: true };
    }
    console.error(`[voice] tool ${name} failed`, error);
    return { content: "That action failed on the server. Tell the patient you couldn't save it.", isError: true };
  }
}
