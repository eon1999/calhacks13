import Anthropic from "@anthropic-ai/sdk";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { CLAUDE_EFFORT, CLAUDE_MAX_TOKENS, CLAUDE_MODEL, MAX_TOOL_ROUNDS } from "./config";
import { loadPatientContext } from "./context";
import { convex } from "./convex";
import {
  checkInTriggerFor,
  describeEvent,
  slotsForEvent,
  wearableEvent,
  type WearableEvent,
} from "./events";
import { buildSystemPrompt, toSpeakable } from "./prompt";
import { runTool, voiceTools, type ToolContext } from "./tools";

export type AgentInput =
  | { kind: "speech"; text: string }
  | { kind: "event"; event: WearableEvent };

export interface AgentTurnResult {
  reply: string;
  /** Tools Claude ran this turn, e.g. ["mark_dose_taken"]. Useful for UI/debugging. */
  actions: string[];
  /** Wall-clock ms spent in Claude calls, and how many calls (1 + tool rounds). */
  llmMs: number;
  llmCalls: number;
}

export class PatientNotFoundError extends Error {
  constructor(patientId: string) {
    super(`Patient ${patientId} not found`);
    this.name = "PatientNotFoundError";
  }
}

const FALLBACK_REPLY = "Sorry, I didn't quite catch that. Could you say it again?";

let anthropic: Anthropic | null = null;
function claude(): Anthropic {
  anthropic ??= new Anthropic();
  return anthropic;
}

type StoredTurn = Pick<Doc<"voiceTurns">, "role" | "text" | "event">;

/** The most recent wearable event in the conversation (what started it), if any. */
export function conversationEvent(turns: StoredTurn[]): WearableEvent | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const parsed = wearableEvent.safeParse(turns[i].event);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/** Convert stored turns into Claude messages. Wearable events are user-side context. */
export function toMessages(turns: StoredTurn[]): Anthropic.Beta.BetaMessageParam[] {
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) => ({
    role: t.role === "assistant" ? "assistant" : "user",
    content: t.text,
  }));
  // The history window may start mid-conversation; Claude requires a user turn first.
  const firstUser = messages.findIndex((m) => m.role === "user");
  return firstUser === -1 ? [] : messages.slice(firstUser);
}

function inputTurn(input: AgentInput, eventText: string | null): StoredTurn {
  return input.kind === "speech"
    ? { role: "user", text: input.text }
    : { role: "event", text: eventText ?? "", event: input.event };
}

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ");
}

/**
 * One conversational turn: patient speech (or a wearable event) in, a short
 * spoken reply out. Runs Claude's tool loop and persists both sides of the turn.
 */
export async function runAgentTurn(params: {
  patientId: Id<"patients">;
  sessionId: string;
  input: AgentInput;
  now?: number;
}): Promise<AgentTurnResult> {
  const { patientId, sessionId, input } = params;
  const now = params.now ?? Date.now();

  const ctx = await loadPatientContext(patientId, now);
  if (!ctx) throw new PatientNotFoundError(patientId);

  const event = input.kind === "event" ? input.event : null;
  const turn = inputTurn(input, event ? describeEvent(event, slotsForEvent(event, ctx.slots)) : null);
  const history = await convex().query(api.voice.getTurns, { sessionId });
  const messages = toMessages([...history, turn]);

  const toolCtx: ToolContext = {
    patientId,
    slots: ctx.slots,
    // A check-in saved on the patient's reply still belongs to the event that started it.
    checkInTrigger: checkInTriggerFor(conversationEvent([...history, turn])),
    transcript: () =>
      [...history, turn]
        .filter((t) => t.role !== "event")
        .map((t) => `${t.role === "user" ? ctx.patient.name : "Cadence"}: ${t.text}`)
        .join("\n"),
  };

  const system = buildSystemPrompt(ctx, now);
  const actions: string[] = [];
  let reply = FALLBACK_REPLY;
  let llmMs = 0;
  let llmCalls = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const started = performance.now();
    llmCalls++;
    const response = await claude().beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS,
      output_config: { effort: CLAUDE_EFFORT },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      tools: voiceTools,
      messages,
    });
    llmMs += performance.now() - started;

    if (response.stop_reason === "refusal") break;

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = toSpeakable(textOf(response.content));
      if (text) reply = text;
      break;
    }

    messages.push({ role: "assistant", content: response.content });
    const results = await Promise.all(
      toolUses.map(async (use): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        actions.push(use.name);
        const outcome = await runTool(use.name, use.input, toolCtx);
        return {
          type: "tool_result",
          tool_use_id: use.id,
          content: outcome.content,
          is_error: outcome.isError,
        };
      }),
    );
    messages.push({ role: "user", content: results });
  }

  await convex().mutation(api.voice.appendTurns, {
    patientId,
    sessionId,
    turns: [turn, { role: "assistant", text: reply }],
  });

  return { reply, actions, llmMs: Math.round(llmMs), llmCalls };
}
