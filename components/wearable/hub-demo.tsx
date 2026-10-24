"use client";

import { BandViewer } from "./band-viewer";
import { PatientOnboarding } from "./patient-onboarding";
import { SafetyCard } from "./safety-card";
import { useBandPairing } from "./use-band-pairing";
import { useHubPrompts } from "./use-hub-prompts";
import { useVoiceAgent } from "./use-voice-agent";
import { WearableSimulator } from "./wearable-simulator";

/** /hub: the 3D band and patient onboarding up top, the voice simulator below, all on one patient. */
export function HubDemo() {
  const band = useBandPairing();
  // Once paired, the band talks to its own patient; until then, the demo patient.
  const agent = useVoiceAgent(band.pairing.state === "paired" ? band.pairing.patientId : undefined);
  // Speak reminders, fall checks and other prompts the server raises.
  const prompts = useHubPrompts(agent);

  return (
    <>
      <div className="grid items-start gap-6 md:grid-cols-2">
        <section className="md:sticky md:top-6">
          <p className="mono-label text-white/80">Cadence band</p>
          <h1 className="display mt-3 text-[clamp(3rem,7vw,5.5rem)] text-white">
            <em>Wearable</em> simulator
          </h1>
          <BandViewer />
        </section>
        <section className="md:pt-10">
          <PatientOnboarding
            patientId={agent.patient?.id}
            loadError={agent.loadError}
            onSeed={agent.seed}
            onMedsChanged={agent.refresh}
          />
        </section>
      </div>
      <section className="mt-12 space-y-4">
        <div className="mx-auto max-w-5xl space-y-3">
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
        <WearableSimulator band={band} agent={agent} />
      </section>
    </>
  );
}
