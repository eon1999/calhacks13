"use client";

import { useCallback } from "react";
import { BandViewer } from "./band-viewer";
import { HubNowCard } from "./hub-now-card";
import { PatientOnboarding } from "./patient-onboarding";
import { SafetyCard } from "./safety-card";
import { useBandPairing } from "./use-band-pairing";
import { useHubPatient } from "./use-hub-patient";
import { useHubPrompts } from "./use-hub-prompts";
import { useVoiceAgent } from "./use-voice-agent";
import { WearableSimulator } from "./wearable-simulator";

/** /hub: the 3D band and patient onboarding up top, the voice simulator below, all on one patient. */
export function HubDemo() {
  const band = useBandPairing();
  // The band talks to the patient created on this page (remembered in the
  // browser). No fallback to the first patient: until one is created, there's none.
  const hubPatient = useHubPatient();
  const agent = useVoiceAgent(hubPatient.restored ? hubPatient.patientId : null);
  // Speak reminders, fall checks and other prompts the server raises.
  const prompts = useHubPrompts(agent);
  const { newConversation } = agent;
  const { choose } = hubPatient;
  const switchTo = useCallback(
    (id: string | null) => {
      choose(id);
      newConversation();
    },
    [choose, newConversation],
  );

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
          {hubPatient.restored && (
            <PatientOnboarding
              key={agent.patient?.id ?? "new"}
              patientId={agent.patient?.id}
              loadError={agent.loadError}
              onCreated={switchTo}
              onNewPatient={() => switchTo(null)}
              onMedsChanged={agent.refresh}
            />
          )}
        </section>
      </div>
      {!agent.patient ? (
        <p className="mono-label mt-12 text-center text-white/80">Create a patient above to start the band.</p>
      ) : (
        <section className="mt-12 space-y-4">
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
              {prompts.pending.length > 0 && (
                <span className="mono-label text-white/70">({prompts.pending.length} waiting)</span>
              )}
            </label>
          </div>
          <WearableSimulator band={band} agent={agent} />
        </section>
      )}
    </>
  );
}
