"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizePairingCode } from "@/lib/onboarding/pairing";
import { ErrorNote, errorText, PrimaryButton, StepActions, StepHeading, TextButton } from "../ui";

interface BandStepProps {
  userId: string;
  patientId: Id<"patients">;
  patientName: string;
  paired: boolean;
  onNext: () => void;
  onBack: () => void;
}

export function BandStep({ userId, patientId, patientName, paired, onNext, onBack }: BandStepProps) {
  const claim = useMutation(api.pairing.claim);
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = normalizePairingCode(code) !== null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await claim({ userId, patientId, code });
      setCode("");
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <StepHeading
        kicker="The band"
        sub="Turn the band on. It shows a six-digit code on its face and reads it out loud. No band yet? Open the simulator in another tab and it'll show one."
      >
        <em>Pair</em> {patientName}&apos;s
        <br />
        wristband
      </StepHeading>

      {paired ? (
        <div className="max-w-xl rounded-3xl border border-violet/30 bg-white/60 p-6">
          <p className="mono-label text-violet">Paired ✓</p>
          <p className="mt-3 font-display text-3xl">The band now knows {patientName}.</p>
          <p className="mt-3 text-sm text-plum-muted">
            When {patientName} first puts it on, the band introduces itself, says who will be kept in the loop, and asks if
            that&apos;s okay. Their answer is saved for the team.
          </p>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="max-w-xl space-y-6">
          <label htmlFor="pairCode" className="mono-label block text-plum-muted">
            Code on the band
          </label>
          <input
            id="pairCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d\s-]/g, ""))}
            placeholder="000 000"
            className="w-full rounded-3xl border border-plum/15 bg-white/60 px-6 py-4 text-center font-display text-6xl tracking-[0.2em] text-plum outline-none placeholder:text-plum/15 focus:border-violet"
          />
          <ErrorNote message={error} />
          <div className="flex flex-wrap items-center gap-4">
            <PrimaryButton type="submit" disabled={!valid || saving}>
              {saving ? "Pairing…" : "Pair band"}
            </PrimaryButton>
            <a href="/hub" target="_blank" rel="noreferrer" className="mono-label text-plum-muted underline-offset-4 hover:text-violet hover:underline">
              Open the band simulator ↗
            </a>
          </div>
        </form>
      )}

      <StepActions>
        <TextButton type="button" onClick={onBack}>
          ← Back
        </TextButton>
        <PrimaryButton type="button" onClick={onNext}>
          {paired ? "Continue" : "Do this later"}
        </PrimaryButton>
      </StepActions>
    </div>
  );
}
