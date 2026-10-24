"use client";

import { BandViewer } from "./band-viewer";
import { PatientOnboarding } from "./patient-onboarding";
import { useBandPairing } from "./use-band-pairing";
import { useVoiceAgent } from "./use-voice-agent";
import { WearableSimulator } from "./wearable-simulator";

/** /hub: the 3D band and patient onboarding up top, the voice simulator below, all on one patient. */
export function HubDemo() {
  const band = useBandPairing();
  // Once paired, the band talks to its own patient; until then, the demo patient.
  const agent = useVoiceAgent(band.pairing.state === "paired" ? band.pairing.patientId : undefined);

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
      <section className="mt-12">
        <WearableSimulator band={band} agent={agent} />
      </section>
    </>
  );
}
