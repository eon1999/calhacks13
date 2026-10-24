"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { Panel } from "@/components/app/app-shell";
import { MedicationEditor } from "@/components/onboarding/steps/meds-step";
import { ErrorNote, errorText, SecondaryButton, TextButton, TextInput } from "@/components/onboarding/ui";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

export function MedicationsPanel({
  userId,
  patientId,
  medications,
}: {
  userId: string;
  patientId: Id<"patients">;
  medications: Doc<"medications">[];
}) {
  const addMedication = useMutation(api.onboarding.addMedication);
  const removeMedication = useMutation(api.onboarding.removeMedication);

  return (
    <Panel title="Medicines and schedule">
      <p className="mb-5 max-w-prose text-sm text-plum-muted">
        Entered from the prescription; Cadence never changes it. Reminders go out at each time and again 15 minutes later; if
        the pillbox isn&apos;t opened by the end of the reminder window, the care team is told.
      </p>
      {medications.length > 0 && (
        <ul className="mb-8 space-y-3">
          {medications.map((m) => (
            <MedicationRow key={m._id} userId={userId} med={m} onRemove={() => removeMedication({ userId, medicationId: m._id })} />
          ))}
        </ul>
      )}
      <MedicationEditor
        medications={[]}
        listLabel="Common after surgery"
        stacked
        onAdd={(med) => addMedication({ userId, patientId, ...med })}
        onRemove={async () => {}}
      />
    </Panel>
  );
}

function MedicationRow({ userId, med, onRemove }: { userId: string; med: Doc<"medications">; onRemove: () => Promise<unknown> }) {
  const update = useMutation(api.settings.updateMedication);
  const [editing, setEditing] = useState(false);
  const [doseLabel, setDoseLabel] = useState(med.doseLabel);
  const [times, setTimes] = useState(med.times.join(", "));
  const [windowMinutes, setWindowMinutes] = useState(String(med.windowMinutes));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await task();
      after?.();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-plum/10 bg-white/70 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl leading-tight">{med.name}</p>
          <p className="text-plum-muted">{med.doseLabel}</p>
          <p className="mono-label mt-2 text-violet">
            {med.times.join(" · ")} · reminder window {med.windowMinutes} min
          </p>
        </div>
        <div className="flex gap-1">
          <TextButton type="button" onClick={() => setEditing((e) => !e)}>
            {editing ? "Cancel" : "Edit"}
          </TextButton>
          <TextButton
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirm(`Stop reminders for ${med.name}? Past doses stay in the history.`)) void run(onRemove);
            }}
          >
            Remove
          </TextButton>
        </div>
      </div>
      {editing && (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                update({
                  userId,
                  medicationId: med._id,
                  doseLabel,
                  times: times.split(/[,\s]+/).filter(Boolean),
                  windowMinutes: Number(windowMinutes),
                }),
              () => setEditing(false),
            );
          }}
        >
          <label className="space-y-1">
            <span className="mono-label text-plum-muted">Dose</span>
            <TextInput value={doseLabel} onChange={(e) => setDoseLabel(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="mono-label text-plum-muted">Times (HH:mm, comma separated)</span>
            <TextInput value={times} onChange={(e) => setTimes(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="mono-label text-plum-muted">Window (min)</span>
            <TextInput type="number" min={5} max={240} value={windowMinutes} onChange={(e) => setWindowMinutes(e.target.value)} />
          </label>
          <SecondaryButton type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </SecondaryButton>
        </form>
      )}
      <div className="mt-2">
        <ErrorNote message={error} />
      </div>
    </li>
  );
}
