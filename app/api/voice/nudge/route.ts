import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { runAgentTurn } from "@/lib/voice/agent";
import { synthesize } from "@/lib/voice/cartesia";
import { loadPatientContext } from "@/lib/voice/context";
import { convex } from "@/lib/voice/convex";
import { localDateKey, recoveryStatus } from "@/lib/onboarding/recovery";
import { dueScheduledCheckIn, dueSlots, isSafetyEvent, nudgeKey, wearableEvent } from "@/lib/voice/events";
import {
  HEADER_ACTIONS,
  HEADER_EVENT,
  HEADER_NUDGE_KEY,
  HEADER_REPLY,
  audioResponse,
  handleVoiceError,
  jsonError,
  patientIdSchema,
  sessionIdSchema,
  timed,
  type StageTimings,
} from "@/lib/voice/http";

export const maxDuration = 60;

const body = z.object({
  patientId: patientIdSchema,
  sessionId: sessionIdSchema,
  // Omit to let the server decide (polling): a due dose, else a scheduled check-in.
  event: wearableEvent.optional(),
  // Nudge key the device already played; suppresses repeats while still due.
  lastNudgeKey: z.string().max(2000).optional(),
});

/**
 * Agent speaks first: dose reminders, scheduled check-ins, fall follow-ups.
 *
 * JSON body: { patientId, sessionId, event?, lastNudgeKey? }
 * Responds 204 when there is nothing to say, else audio/wav + X-Cadence-* headers.
 * When polling (no event), a due dose wins; otherwise a phase-based scheduled
 * check-in (lib/voice/events.ts) may speak. Both dedupe through the nudge key.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "Invalid request");
    const { sessionId, lastNudgeKey } = parsed.data;
    const patientId = parsed.data.patientId as Id<"patients">;

    let event = parsed.data.event;
    let key = "";
    if (!event) {
      const now = Date.now();
      const ctx = await loadPatientContext(patientId, now);
      if (!ctx) return jsonError(404, "Patient not found");
      const due = dueSlots(ctx.slots);
      if (due.length > 0) {
        // Never start a check-in over a due dose, even one the band already reminded.
        key = nudgeKey(due);
        if (key === lastNudgeKey) return new Response(null, { status: 204 });
        event = "dose_due";
      } else {
        const { recovery, timeZone } = ctx.patient;
        const checkIn = dueScheduledCheckIn({
          recovery: recovery ? recoveryStatus(recovery.surgeryDate, localDateKey(timeZone, now)) : null,
          doses: ctx.doseTimes,
          checkInTimes: ctx.checkInsToday.map((c) => c.at),
          timeZone,
          now,
        });
        if (!checkIn || checkIn.key === lastNudgeKey) return new Response(null, { status: 204 });
        key = checkIn.key;
        event = "check_in";
      }
    }

    // Record falls/SOS before involving the agent, so they're logged even if
    // Claude or TTS fails.
    if (isSafetyEvent(event)) {
      await convex().mutation(api.voice.logDeviceEvent, { patientId, type: event });
    }

    const { reply, actions, llmMs } = await runAgentTurn({
      patientId,
      sessionId,
      input: { kind: "event", event },
    });
    const timings: StageTimings = { llm: llmMs };
    const wav = await timed(timings, "tts", () => synthesize(reply));

    return audioResponse(
      wav,
      {
        [HEADER_REPLY]: reply,
        [HEADER_ACTIONS]: actions.join(","),
        [HEADER_NUDGE_KEY]: key,
        [HEADER_EVENT]: event,
      },
      timings,
    );
  } catch (error: unknown) {
    return handleVoiceError(error, "nudge");
  }
}
