"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { healthSummary } from "@/lib/onboarding/health";
import { localDateKey, recoveryStatus } from "@/lib/onboarding/recovery";
import { nextStep, prevStep, STEPS, useSetupProgress, type SetupDraft, type StepId } from "./setup-state";
import { BandStep } from "./steps/band-step";
import { DoneStep } from "./steps/done-step";
import { HealthStep } from "./steps/health-step";
import { MedsStep } from "./steps/meds-step";
import { PatientStep, RecoveryStep, YouStep } from "./steps/profile-steps";
import { TeamStep } from "./steps/team-step";
import { OnboardingShell, StepRail, errorText } from "./ui";
import { useDemoIdentity } from "./use-demo-identity";

/** Steps that need the patient to exist in Convex first. */
const NEEDS_PATIENT: StepId[] = ["health", "meds", "band", "team", "done"];

function patientArgs(draft: SetupDraft) {
  return {
    ownerName: draft.ownerName,
    ownerPhone: draft.ownerPhone || undefined,
    relationship: draft.relationship || undefined,
    name: draft.patientName,
    preferredName: draft.preferredName || undefined,
    timeZone: draft.timeZone,
    language: draft.language,
    extraPatience: draft.extraPatience,
    recovery: {
      procedure: draft.procedure,
      procedureOther: draft.procedure === "other" ? draft.procedureOther : undefined,
      surgeryDate: draft.surgeryDate,
      dischargeDate: draft.dischargeDate || undefined,
      careNotes: draft.careNotes || undefined,
    },
  };
}

/** Family-led setup: you → patient → recovery → health → meds → band → team → done. */
export function SetupWizard() {
  const { identity } = useDemoIdentity();
  const progress = useSetupProgress();
  const { step, draft, patientId, goTo, restored } = progress;
  const createPatient = useMutation(api.onboarding.createPatient);
  const updatePatient = useMutation(api.onboarding.updatePatient);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const [now] = useState(() => Date.now());

  const setup = useQuery(
    api.onboarding.setup,
    identity && patientId ? { userId: identity.id, patientId: patientId as Id<"patients"> } : "skip",
  );

  // A stale patientId (wiped database, other browser identity) sends you back to re-save.
  const lostPatient = !!patientId && setup === null;
  const needsPatient = NEEDS_PATIENT.includes(step) && (!patientId || lostPatient);
  useEffect(() => {
    if (restored && needsPatient) goTo("recovery");
  }, [restored, needsPatient, goTo]);

  useEffect(() => {
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  if (!restored || !identity) {
    return <OnboardingShell>{null}</OnboardingShell>;
  }

  const patientName = draft.preferredName.trim() || draft.patientName.trim().split(/\s+/)[0] || "them";
  const next = () => goTo(nextStep(step));
  const back = () => goTo(prevStep(step));

  async function saveProfile() {
    if (!identity) return;
    setSaving(true);
    setSaveError(null);
    try {
      const args = patientArgs(draft);
      if (patientId && !lostPatient) {
        await updatePatient({ userId: identity.id, patientId: patientId as Id<"patients">, ...args });
      } else {
        const id = await createPatient({ userId: identity.id, ...args });
        progress.setPatientId(id);
      }
      next();
    } catch (e: unknown) {
      setSaveError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  const rail = (
    <StepRail steps={[...STEPS]} current={step} done={(id) => progress.visited.includes(id as StepId)} />
  );

  function body() {
    const common = { draft, updateDraft: progress.updateDraft, onNext: next, onBack: back };
    switch (step) {
      case "you":
        return <YouStep {...common} />;
      case "patient":
        return <PatientStep {...common} />;
      case "recovery":
        return <RecoveryStep {...common} onNext={() => void saveProfile()} saving={saving} error={saveError} />;
    }
    if (!setup || !identity) return <p className="mono-label text-plum-muted">Loading…</p>;
    const pid = setup.patient._id;
    switch (step) {
      case "health":
        return (
          <HealthStep
            userId={identity.id}
            patientId={pid}
            patientName={patientName}
            health={setup.patient.health}
            onNext={next}
            onBack={back}
          />
        );
      case "meds":
        return (
          <MedsStep
            userId={identity.id}
            patientId={pid}
            patientName={patientName}
            medications={setup.medications}
            onNext={next}
            onBack={back}
          />
        );
      case "band":
        return (
          <BandStep
            userId={identity.id}
            patientId={pid}
            patientName={patientName}
            paired={setup.devices.length > 0}
            onNext={next}
            onBack={back}
          />
        );
      case "team":
        return (
          <TeamStep
            userId={identity.id}
            patientId={pid}
            patientName={patientName}
            members={setup.members}
            pendingInvites={setup.pendingInvites}
            onNext={next}
            onBack={back}
          />
        );
      case "done": {
        const r = setup.patient.recovery;
        return (
          <DoneStep
            patientName={patientName}
            recoveryLabel={r ? recoveryStatus(r.surgeryDate, localDateKey(setup.patient.timeZone, now)).label : null}
            healthLabel={healthSummary(setup.patient.health)}
            medicationCount={setup.medications.length}
            paired={setup.devices.length > 0}
            teamCount={setup.members.length + setup.pendingInvites.length}
            onEdit={goTo}
          />
        );
      }
    }
  }

  return (
    <OnboardingShell aside={rail}>
      <div ref={top} className="scroll-mt-24">
        <div key={step} className="animate-in fade-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none">
          {body()}
        </div>
      </div>
    </OnboardingShell>
  );
}
