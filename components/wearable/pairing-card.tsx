"use client";

import { Link2, Sparkles, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPairingCode, spokenPairingCode } from "@/lib/onboarding/pairing";
import type { BandPairing } from "./use-band-pairing";
import type { useVoiceAgent } from "./use-voice-agent";

type Agent = ReturnType<typeof useVoiceAgent>;

interface PairingCardProps {
  pairing: BandPairing;
  error: string | null;
  agent: Agent;
  busy: boolean;
  onForget: () => void;
}

const CONSENT_TEXT = { agreed: "agreed", declined: "said not yet" } as const;

/** Band setup: show the pairing code, then run the first-boot intro once paired. */
export function PairingCard({ pairing, error, agent, busy, onForget }: PairingCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Link2 className="size-4" /> Band setup
        </CardTitle>
        {pairing.state !== "loading" && (
          <span className="font-mono text-xs text-muted-foreground">{pairing.deviceId}</span>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error && <p className="text-destructive">{error}</p>}

        {pairing.state === "loading" && !error && <p className="text-muted-foreground">Starting up…</p>}

        {pairing.state === "code" && (
          <>
            <p className="text-muted-foreground">
              Enter this code in <a href="/start" target="_blank" rel="noreferrer" className="underline">setup</a> to pair
              the band.
            </p>
            <p className="text-center font-mono text-4xl tracking-[0.25em]" aria-label={`Pairing code ${pairing.code}`}>
              {formatPairingCode(pairing.code)}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => agent.testVoiceMessage(`Hi! To set me up, enter this code: ${spokenPairingCode(pairing.code)}.`)}
            >
              <Volume2 /> Say the code
            </Button>
          </>
        )}

        {pairing.state === "paired" && (
          <>
            <p>
              Paired to <span className="font-semibold">{pairing.patientName}</span>.{" "}
              {pairing.consent ? (
                <Badge variant="secondary">Consent: {CONSENT_TEXT[pairing.consent]}</Badge>
              ) : (
                <Badge variant="outline">Consent not asked yet</Badge>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy || !agent.patient} onClick={() => agent.nudge("first_boot")}>
                <Sparkles /> First time on the wrist
              </Button>
              <Button variant="ghost" size="sm" onClick={onForget}>
                Reset band
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The band introduces itself, names who it keeps in the loop, and asks permission. Answer by voice or by typing.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
