"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useNow } from "@/components/app/use-now";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PROMPT_EVENTS, isPromptKind } from "@/lib/alerts";
import type { useVoiceAgent } from "./use-voice-agent";

type Agent = ReturnType<typeof useVoiceAgent>;

/**
 * Speaks what the server asks the band to say: dose reminders at T and T+15,
 * "did you take them?" after a lid opening, fall check-ins, SOS, nudges to
 * move. The prompts come from the dose engine and device routes as "ask"
 * alerts (convex/alerts.ts pendingPrompts); this is the browser stand-in for
 * the band's heartbeat.
 */
export function useHubPrompts(agent: Agent) {
  const [enabled, setEnabled] = useState(true);
  const patientId = agent.patient?.id as Id<"patients"> | undefined;
  const now = useNow(5_000);
  const prompts = useQuery(
    api.alerts.pendingPrompts,
    patientId && now !== null && enabled ? { patientId, now } : "skip",
  );
  const markDelivered = useMutation(api.alerts.markDelivered);
  const handled = useRef(new Set<string>());
  const { status, nudge, refresh } = agent;

  useEffect(() => {
    if (!enabled || !prompts?.length) return;
    if (status !== "idle" && status !== "error") return;
    const next = prompts.find((p) => !handled.current.has(p._id));
    if (!next || !isPromptKind(next.kind)) return;
    const event = PROMPT_EVENTS[next.kind];
    handled.current.add(next._id);
    void (async () => {
      await markDelivered({ alertId: next._id });
      await nudge(event, { logged: true });
      await refresh();
    })();
  }, [enabled, prompts, status, nudge, refresh, markDelivered]);

  return { enabled, setEnabled, pending: prompts ?? [] };
}
