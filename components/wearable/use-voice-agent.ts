"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DoseSlot } from "@/lib/schedule";
import { EVENT_LABELS, type WearableEvent } from "@/lib/voice/events";

export type AgentStatus = "idle" | "listening" | "thinking" | "speaking" | "error";

export interface LogEntry {
  id: string;
  who: "patient" | "cadence" | "event" | "voice_test";
  text: string;
  actions?: string[];
}

export interface PatientInfo {
  id: string;
  name: string;
  /** What the band calls them, if set in setup. */
  preferredName: string | null;
  timeZone: string;
}

const NUDGE_POLL_MS = 30_000;

function header(res: Response, name: string): string {
  const raw = res.headers.get(name);
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function errorMessage(res: Response): Promise<string> {
  const json: unknown = await res.json().catch(() => null);
  if (json && typeof json === "object" && "error" in json && typeof json.error === "string") {
    return json.error;
  }
  return `Request failed (${res.status})`;
}

function playWav(blob: Blob): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const done = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    // Autoplay can be blocked before the first user gesture; the reply is still in the log.
    audio.play().catch(done);
  });
}

/**
 * Client for the wearable voice endpoints (/api/voice/*).
 * `patientId` is the patient the band is paired to; without one the demo's first patient is used.
 * With `enabled` false it loads no patient (and so never polls), e.g. an unpaired band in the demo view.
 */
export function useVoiceAgent(patientId?: string, enabled = true) {
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [slots, setSlots] = useState<DoseSlot[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  // Created lazily (not during render) so /hub can still be prerendered.
  const sessionRef = useRef<string | null>(null);
  const sessionId = useCallback(() => (sessionRef.current ??= crypto.randomUUID()), []);
  // Off by default: the dose engine (convex/doses.ts) now sends reminders as hub
  // prompts (use-hub-prompts.ts). Polling stays as a fallback for testers.
  const [autoReminders, setAutoReminders] = useState(false);
  const lastNudgeKey = useRef<string | undefined>(undefined);
  const busy = useRef(false);

  const append = useCallback((entry: Omit<LogEntry, "id">) => {
    setLog((prev) => [...prev, { ...entry, id: crypto.randomUUID() }]);
  }, []);

  const refresh = useCallback(async () => {
    const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : "";
    const res = await fetch(`/api/voice/patient${query}`, { cache: "no-store" });
    if (!res.ok) {
      setPatient(null);
      setLoadError(await errorMessage(res));
      return;
    }
    const { data } = (await res.json()) as { data: { patient: PatientInfo; slots: DoseSlot[] } };
    setPatient(data.patient);
    setSlots(data.slots);
    setLoadError(null);
  }, [patientId]);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    refresh().catch(() => setLoadError("Could not reach the server"));
  }, [refresh, enabled]);

  const seed = useCallback(async () => {
    const res = await fetch("/api/demo/seed", { method: "POST" });
    if (!res.ok) {
      setLoadError(await errorMessage(res));
      return;
    }
    await refresh();
  }, [refresh]);

  /** Shared handling for an audio reply from /turn or /nudge. */
  const speak = useCallback(
    async (res: Response) => {
      const reply = header(res, "X-Cadence-Reply");
      const actions = header(res, "X-Cadence-Actions").split(",").filter(Boolean);
      append({ who: "cadence", text: reply, actions });
      setStatus("speaking");
      await playWav(await res.blob());
      setStatus("idle");
      if (actions.length) await refresh();
    },
    [append, refresh],
  );

  const run = useCallback(async (task: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      await task();
    } catch (e: unknown) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      busy.current = false;
    }
  }, []);

  const sendTurn = useCallback(
    (input: { audio: Blob } | { text: string }) =>
      run(async () => {
        if (!patient) return;
        setStatus("thinking");
        const form = new FormData();
        form.append("patientId", patient.id);
        form.append("sessionId", sessionId());
        if ("audio" in input) form.append("audio", input.audio);
        else {
          form.append("text", input.text);
          append({ who: "patient", text: input.text });
        }
        const res = await fetch("/api/voice/turn", { method: "POST", body: form });
        if (!res.ok) throw new Error(await errorMessage(res));
        if ("audio" in input) {
          append({ who: "patient", text: header(res, "X-Cadence-Transcript") || "(nothing heard)" });
        }
        await speak(res);
      }),
    [patient, sessionId, run, append, speak],
  );

  const nudge = useCallback(
    (event?: WearableEvent, opts: { logged?: boolean } = {}) =>
      run(async () => {
        if (!patient) return;
        const res = await fetch("/api/voice/nudge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId: patient.id,
            sessionId: sessionId(),
            event,
            lastNudgeKey: event ? undefined : lastNudgeKey.current,
            logged: opts.logged,
          }),
        });
        if (res.status === 204) return;
        if (!res.ok) throw new Error(await errorMessage(res));
        const key = header(res, "X-Cadence-Nudge-Key");
        if (key) lastNudgeKey.current = key;
        const spoken = (header(res, "X-Cadence-Event") || event || "dose_due") as WearableEvent;
        append({ who: "event", text: EVENT_LABELS[spoken] ?? EVENT_LABELS.dose_due });
        setStatus("thinking");
        await speak(res);
      }),
    [patient, sessionId, run, append, speak],
  );

  // Poll for due-dose reminders and scheduled check-ins, like the wearable's heartbeat will.
  useEffect(() => {
    if (!patient || !autoReminders) return;
    const tick = () => void nudge();
    tick();
    const id = setInterval(tick, NUDGE_POLL_MS);
    return () => clearInterval(id);
  }, [patient, autoReminders, nudge]);

  /** Debug: speak arbitrary text through the TTS voice, bypassing Claude. */
  const testVoiceMessage = useCallback(
    (text: string) =>
      run(async () => {
        setStatus("thinking");
        const res = await fetch("/api/debug/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(await errorMessage(res));
        append({ who: "voice_test", text });
        setStatus("speaking");
        await playWav(await res.blob());
        setStatus("idle");
      }),
    [run, append],
  );

  const newConversation = useCallback(() => {
    sessionRef.current = null;
    lastNudgeKey.current = undefined;
    setLog([]);
    setError(null);
    setStatus("idle");
  }, []);

  /** Debug: wipe today's doses, check-ins, alerts and voice history, then start fresh. */
  const resetToday = useCallback(
    () =>
      run(async () => {
        if (!patient) return;
        const res = await fetch("/api/debug/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId: patient.id }),
        });
        if (!res.ok) throw new Error(await errorMessage(res));
        newConversation();
        await refresh();
      }),
    [patient, run, newConversation, refresh],
  );

  return {
    patient,
    slots,
    refresh,
    loadError,
    status,
    setStatus,
    error,
    log,
    autoReminders,
    setAutoReminders,
    seed,
    sendTurn,
    nudge,
    testVoiceMessage,
    newConversation,
    resetToday,
  };
}
