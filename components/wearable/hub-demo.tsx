"use client";

import Link from "next/link";
import { BandViewer } from "./band-viewer";
import { HubNowCard } from "./hub-now-card";
import { PatientOnboarding } from "./patient-onboarding";
import { SafetyCard } from "./safety-card";
import { useBandPairing } from "./use-band-pairing";
import { useHubPrompts } from "./use-hub-prompts";
import { useVoiceAgent } from "./use-voice-agent";
import { WearableSimulator, type SimulatorMode } from "./wearable-simulator";

const navLink = "mono-label rounded-full px-3 py-2 text-white/75 transition-colors hover:text-white";

/**
 * /hub: the 3D band and patient onboarding up top, the voice simulator below, all on one patient.
 * In "demo" mode (/hub?demo=1, the judge's band) there's no onboarding or debug tools, and
 * nothing loads until the band is paired from setup.
 */
export function HubDemo({ mode = "debug" }: { mode?: SimulatorMode }) {
  const band = useBandPairing();
  const pairedTo = band.pairing.state === "paired" ? band.pairing.patientId : undefined;
  const live = pairedTo !== undefined || mode === "debug";
  // Once paired, the band talks to its own patient; until then (debug only), the demo patient.
  const agent = useVoiceAgent(pairedTo, live);
  // Speak reminders, fall checks and other prompts the server raises.
  const prompts = useHubPrompts(agent);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <span className="tag-pill">▸ {mode === "demo" ? "Demo" : "Debug tools on"}</span>
        <nav className="flex gap-1">
          {mode === "demo" ? (
            <>
              <Link href="/try" className={navLink}>
                ← Demo guide
              </Link>
              <Link href="/hub" className={navLink}>
                Debug tools
              </Link>
            </>
          ) : (
            <Link href="/hub?demo=1" className={navLink}>
              Demo view →
            </Link>
          )}
        </nav>
      </div>

      <div className="grid items-start gap-6 md:grid-cols-2">
        <section className="md:sticky md:top-6">
          <p className="mono-label text-white/80">Cadence band</p>
          <h1 className="display mt-3 text-[clamp(3rem,7vw,5.5rem)] text-white">
            {mode === "demo" ? (
              <>
                <em>The</em> Cadence band
              </>
            ) : (
              <>
                <em>Wearable</em> simulator
              </>
            )}
          </h1>
          <BandViewer />
        </section>
        <section className="md:pt-10">
          {mode === "debug" ? (
            <PatientOnboarding
              patientId={agent.patient?.id}
              loadError={agent.loadError}
              onSeed={agent.seed}
              onMedsChanged={agent.refresh}
            />
          ) : (
            <p className="max-w-[40ch] text-xl leading-snug text-white/90">
              Talk to it like the person wearing it would. When something sounds wrong, the family gets a text.
            </p>
          )}
        </section>
      </div>

      <section className="mt-12 space-y-4">
        {live && (
          <div className="mx-auto max-w-5xl space-y-3">
            <HubNowCard agent={agent} />
            <SafetyCard patientId={agent.patient?.id} />
            <label className="flex items-center gap-3 text-base text-white">
              <input
                type="checkbox"
                className="size-5"
                checked={prompts.enabled}
                onChange={(e) => prompts.setEnabled(e.target.checked)}
              />
              Speak reminders and check-ins from Cadence automatically
              {prompts.pending.length > 0 && <span className="mono-label text-white/70">({prompts.pending.length} waiting)</span>}
            </label>
          </div>
        )}
        <div className="cadence-theme">
          <WearableSimulator band={band} agent={agent} mode={mode} />
        </div>
      </section>
    </>
  );
}
