"use client";

import type { ReactNode } from "react";
import { HeartPulse, Megaphone, Siren, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WearableEvent } from "@/lib/voice/events";
import type { useVoiceAgent } from "./use-voice-agent";
import { cardTitle } from "./styles";

type Agent = ReturnType<typeof useVoiceAgent>;

interface TryItCardProps {
  agent: Agent;
  busy: boolean;
}

const MOMENTS: { label: string; icon: ReactNode; event?: WearableEvent; says?: string; danger?: boolean }[] = [
  { label: "Simulate a fall", icon: <TriangleAlert />, event: "fall", danger: true },
  { label: "Press SOS", icon: <Siren />, event: "sos", danger: true },
  { label: "“The wound looks red and feels warm”", icon: <Megaphone />, says: "The wound looks red and it feels warm." },
  { label: "Daily check-in", icon: <HeartPulse />, event: "check_in" },
];

/** Demo view: a few one-tap moments that show the band talking and the family getting a text. */
export function TryItCard({ agent, busy }: TryItCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={cardTitle}>Try it</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {MOMENTS.map((m) => (
            <Button
              key={m.label}
              variant={m.danger ? "destructive" : "outline"}
              disabled={busy}
              className="h-auto min-h-8 justify-start py-1.5 text-left whitespace-normal"
              onClick={() => void (m.event ? agent.nudge(m.event) : agent.sendTurn({ text: m.says! }))}
            >
              {m.icon} {m.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Answer the band by voice or by typing. When something is wrong, Cadence texts the family, so the phone you added
          in setup should buzz.
        </p>
      </CardContent>
    </Card>
  );
}
