"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Mic, RotateCcw, Send, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SlotStatus } from "@/lib/schedule";
import { DebugPanel } from "./debug-panel";
import { PairingCard } from "./pairing-card";
import { TextAlertsCard } from "./text-alerts-card";
import { TryItCard } from "./try-it-card";
import { useBandPairing } from "./use-band-pairing";
import { useRecorder } from "./use-recorder";
import { useVoiceAgent, type AgentStatus } from "./use-voice-agent";
import { cardTitle } from "./styles";

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

/** "debug": tester tools, falls back to the seeded patient. "demo": what a judge sees, nothing until paired. */
export type SimulatorMode = "debug" | "demo";

export function WearableSimulator({ mode = "debug" }: { mode?: SimulatorMode }) {
  const band = useBandPairing();
  const pairedTo = band.pairing.state === "paired" ? band.pairing.patientId : undefined;
  const paired = pairedTo !== undefined;
  // Once paired, the band talks to its own patient; until then (debug only), the demo patient.
  const agent = useVoiceAgent(pairedTo, paired || mode === "debug");
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

  if (mode === "demo" && !paired) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        {pairingCard}
        <p className="text-center text-sm text-plum-muted">
          Waiting to be paired. Type the code into the band step of{" "}
          <a href="/start" target="_blank" rel="noreferrer" className="text-violet underline-offset-4 hover:underline">
            setup
          </a>
          ; this page switches over by itself.
        </p>
      </div>
    );
  }

  if (!agent.patient) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        {pairingCard}
        <Card>
          <CardHeader>
            <CardTitle className={cardTitle}>Patient</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{agent.loadError ?? "Loading…"}</p>
            {mode === "debug" && <Button onClick={() => void agent.seed()}>Seed demo patient</Button>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-[320px_1fr]">
      <div className="space-y-4 self-start md:sticky md:top-8">
        <div className="relative mx-auto w-72 pb-2">
          {/* strap */}
          <div aria-hidden className="mx-auto h-10 w-36 rounded-t-[1.75rem] bg-gradient-to-t from-plum/85 to-plum/0" />
          <div className="relative flex aspect-square w-72 flex-col items-center justify-center gap-4 rounded-full border-[10px] border-plum bg-[radial-gradient(120%_100%_at_50%_0%,#ffffff,#efe4ff_55%,#dcc6ff)] shadow-[0_30px_60px_-24px_rgb(66_18_140/0.65)]">
            <p className="mono-label text-plum-muted">Cadence · {agent.patient.preferredName ?? agent.patient.name}</p>
            <button
              type="button"
              onClick={() => void toggleTalk()}
              disabled={busy}
              aria-label={recorder.recording ? "Stop and send" : "Talk to Cadence"}
              className={`flex size-28 items-center justify-center rounded-full text-white transition-transform duration-300 disabled:opacity-70 ${
                recorder.recording
                  ? "animate-pulse bg-destructive shadow-[0_0_0_10px_rgb(231_0_11/0.15)]"
                  : "glass-pill glass-pill-dark hover:scale-105"
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
            <p className="px-6 text-center font-display text-xl leading-tight">{STATUS_TEXT[agent.status]}</p>
          </div>
          <div aria-hidden className="mx-auto h-10 w-36 rounded-b-[1.75rem] bg-gradient-to-b from-plum/85 to-plum/0" />
        </div>

        <form onSubmit={(e) => void submitTyped(e)} className="flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Or type what the patient says"
            className="h-11 min-w-0 flex-1 rounded-full border border-plum/15 bg-white/60 px-4 text-sm text-plum outline-none backdrop-blur-sm transition-colors placeholder:text-plum-muted/60 focus:border-violet focus:bg-white/80 disabled:opacity-50"
            disabled={busy}
          />
          <Button type="submit" size="icon-lg" className="size-11 rounded-full" disabled={busy || !typed.trim()} aria-label="Send">
            <Send />
          </Button>
        </form>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className={cardTitle}>Today&apos;s medicines</CardTitle>
          </CardHeader>
          <CardContent>
            {agent.slots.length === 0 && <p className="text-sm text-muted-foreground">Nothing scheduled today.</p>}
            <ul className="divide-y divide-plum/10">
              {agent.slots.map((slot) => (
                <li key={slot.slotId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex items-baseline gap-3">
                    <span className="mono-label text-violet">{slot.time}</span>
                    <span>
                      <span className="font-display text-xl leading-none">{slot.name}</span>{" "}
                      <span className="text-plum-muted">{slot.doseLabel}</span>
                    </span>
                  </span>
                  <Badge variant={SLOT_VARIANT[slot.status]}>{slot.status}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className={cardTitle}>Conversation</CardTitle>
            <Button variant="ghost" size="sm" onClick={agent.newConversation}>
              <RotateCcw /> New
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {agent.error && <p className="text-sm text-destructive">{agent.error}</p>}
            {agent.log.length === 0 && (
              <p className="text-sm text-muted-foreground">Tap the mic or trigger an event to start.</p>
            )}
            {agent.log.map((entry) => (
              <ConversationEntry key={entry.id} entry={entry} patientName={agent.patient?.name ?? "Patient"} />
            ))}
          </CardContent>
        </Card>

        {mode === "demo" ? <TryItCard agent={agent} busy={busy} /> : <DebugPanel agent={agent} busy={busy} />}

        <div className="grid items-start gap-4 lg:grid-cols-2">
          {pairingCard}
          {band.pairing.state === "paired" && <TextAlertsCard patientId={band.pairing.patientId} />}
        </div>
      </div>
    </div>
  );
}

type LogEntry = ReturnType<typeof useVoiceAgent>["log"][number];

/** One line of the conversation: device events as dividers, speech as bubbles. */
function ConversationEntry({ entry, patientName }: { entry: LogEntry; patientName: string }) {
  if (entry.who === "event") {
    return (
      <p className="mono-label flex items-center gap-3 text-plum-muted before:h-px before:flex-1 before:bg-plum/10 after:h-px after:flex-1 after:bg-plum/10">
        ⌚ {entry.text}
      </p>
    );
  }
  const fromPatient = entry.who === "patient";
  return (
    <div className={`flex flex-col gap-1 ${fromPatient ? "items-end" : "items-start"}`}>
      <span className="mono-label text-plum-muted">
        {fromPatient ? patientName : entry.who === "voice_test" ? "Test message" : "Cadence"}
      </span>
      <p
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
          fromPatient ? "rounded-br-md bg-white/85 text-plum" : "rounded-bl-md bg-violet/12 text-plum"
        }`}
      >
        {entry.who === "voice_test" && "🔊 "}
        {entry.text}
      </p>
      {entry.actions && entry.actions.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {entry.actions.map((a) => (
            <Badge key={a} variant="secondary">
              {a.replaceAll("_", " ")}
            </Badge>
          ))}
        </span>
      )}
    </div>
  );
}
