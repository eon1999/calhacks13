"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Mic, RotateCcw, Send, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SlotStatus } from "@/lib/schedule";
import { DebugPanel } from "./debug-panel";
import { PairingCard } from "./pairing-card";
import type { useBandPairing } from "./use-band-pairing";
import { useRecorder } from "./use-recorder";
import type { AgentStatus, useVoiceAgent } from "./use-voice-agent";

const STATUS_TEXT: Record<AgentStatus, string> = {
  idle: "Tap to talk",
  listening: "Listening… tap to send",
  thinking: "Thinking…",
  speaking: "Speaking…",
  error: "Something went wrong",
};

const SLOT_VARIANT: Record<SlotStatus, "default" | "secondary" | "outline" | "destructive"> = {
  due: "default",
  taken: "secondary",
  upcoming: "outline",
  missed: "destructive",
};

interface WearableSimulatorProps {
  band: ReturnType<typeof useBandPairing>;
  agent: ReturnType<typeof useVoiceAgent>;
}

/** The band's face, schedule and conversation. `band` and `agent` are shared with the rest of /hub. */
export function WearableSimulator({ band, agent }: WearableSimulatorProps) {
  const recorder = useRecorder();
  const [typed, setTyped] = useState("");

  const busy = agent.status === "thinking" || agent.status === "speaking";

  async function toggleTalk() {
    if (recorder.recording) {
      const audio = await recorder.stop();
      if (audio) await agent.sendTurn({ audio });
      else agent.setStatus("idle");
      return;
    }
    try {
      await recorder.start();
      agent.setStatus("listening");
    } catch {
      agent.setStatus("error");
    }
  }

  async function submitTyped(e: FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    await agent.sendTurn({ text });
  }

  const pairingCard = (
    <PairingCard pairing={band.pairing} error={band.error} agent={agent} busy={busy} onForget={band.forget} />
  );

  if (!agent.patient) {
    return (
      <div className="mx-auto max-w-md space-y-4">
      {pairingCard}
      <Card>
        <CardHeader>
          <CardTitle>Wearable simulator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{agent.loadError ?? "Loading…"}</p>
          <Button onClick={() => void agent.seed()}>Seed demo patient</Button>
        </CardContent>
      </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <div className="mx-auto flex aspect-square w-72 flex-col items-center justify-center gap-4 rounded-full border-8 border-foreground/80 bg-background shadow-xl">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Cadence · {agent.patient.name}</p>
          <button
            type="button"
            onClick={() => void toggleTalk()}
            disabled={busy}
            aria-label={recorder.recording ? "Stop and send" : "Talk to Cadence"}
            className={`flex size-28 items-center justify-center rounded-full text-primary-foreground transition-all disabled:opacity-60 ${
              recorder.recording ? "animate-pulse bg-destructive" : "bg-primary hover:scale-105"
            }`}
          >
            {busy ? (
              <LoaderCircle className="size-12 animate-spin" />
            ) : recorder.recording ? (
              <Square className="size-10" />
            ) : (
              <Mic className="size-12" />
            )}
          </button>
          <p className="px-6 text-center text-sm font-medium">{STATUS_TEXT[agent.status]}</p>
        </div>

        <form onSubmit={(e) => void submitTyped(e)} className="flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Or type what the patient says"
            className="h-8 flex-1 rounded-lg border bg-background px-2.5 text-sm"
            disabled={busy}
          />
          <Button type="submit" size="icon" disabled={busy || !typed.trim()} aria-label="Send">
            <Send />
          </Button>
        </form>

        {pairingCard}

        <DebugPanel agent={agent} busy={busy} />
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Today&apos;s medications</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {agent.slots.map((slot) => (
                <li key={slot.slotId} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-mono">{slot.time}</span> {slot.name}{" "}
                    <span className="text-muted-foreground">{slot.doseLabel}</span>
                  </span>
                  <Badge variant={SLOT_VARIANT[slot.status]}>{slot.status}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Conversation</CardTitle>
            <Button variant="ghost" size="sm" onClick={agent.newConversation}>
              <RotateCcw /> New
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {agent.error && <p className="text-sm text-destructive">{agent.error}</p>}
            {agent.log.length === 0 && (
              <p className="text-sm text-muted-foreground">Tap the mic or trigger an event to start.</p>
            )}
            {agent.log.map((entry) => (
              <div key={entry.id} className="text-sm">
                {entry.who === "event" ? (
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">⌚ {entry.text}</p>
                ) : entry.who === "voice_test" ? (
                  <p className="text-muted-foreground">
                    <span className="font-semibold">🔊 Test message:</span> {entry.text}
                  </p>
                ) : (
                  <p>
                    <span className="font-semibold">{entry.who === "patient" ? agent.patient?.name : "Cadence"}:</span>{" "}
                    {entry.text}
                  </p>
                )}
                {entry.actions?.map((a) => (
                  <Badge key={a} variant="secondary" className="mt-1 mr-1">
                    {a.replaceAll("_", " ")}
                  </Badge>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
