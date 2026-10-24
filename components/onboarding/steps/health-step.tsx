"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { COMMON_ALLERGIES, COMMON_CONDITIONS, MOBILITY } from "@/lib/onboarding/health";
import {
  ChoiceCard,
  ErrorNote,
  errorText,
  Field,
  PrimaryButton,
  StepActions,
  StepHeading,
  TextArea,
  TextButton,
  TextInput,
} from "../ui";

interface HealthStepProps {
  userId: string;
  patientId: Id<"patients">;
  patientName: string;
  health: Doc<"patients">["health"];
  onNext: () => void;
  onBack: () => void;
}

function chipClass(on: boolean) {
  return `rounded-full border px-4 py-2 text-sm transition-colors ${
    on ? "border-violet bg-violet text-white" : "border-plum/15 bg-white/50 hover:border-plum/40"
  }`;
}

/** Toggleable chips for common answers, plus a box to add anything else. */
export function ChipPicker({
  id,
  label,
  options,
  selected,
  onChange,
  placeholder,
  extra,
}: {
  id: string;
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  extra?: ReactNode;
}) {
  const [custom, setCustom] = useState("");
  const has = (item: string) => selected.some((s) => s.toLowerCase() === item.toLowerCase());
  const toggle = (item: string) =>
    onChange(has(item) ? selected.filter((s) => s.toLowerCase() !== item.toLowerCase()) : [...selected, item]);
  const customOnes = selected.filter((s) => !options.some((o) => o.toLowerCase() === s.toLowerCase()));

  function addCustom() {
    const item = custom.trim();
    if (item && !has(item)) onChange([...selected, item]);
    setCustom("");
  }

  return (
    <div className="space-y-3">
      <p className="mono-label text-plum-muted">{label}</p>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {extra}
        {[...options, ...customOnes].map((item) => (
          <button key={item} type="button" aria-pressed={has(item)} onClick={() => toggle(item)} className={chipClass(has(item))}>
            {item}
          </button>
        ))}
      </div>
      <div className="flex max-w-md items-center gap-2">
        <TextInput
          id={id}
          aria-label={`Add another: ${label}`}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder={placeholder}
        />
        <TextButton type="button" onClick={addCustom} disabled={!custom.trim()}>
          + Add
        </TextButton>
      </div>
    </div>
  );
}

export function HealthStep({ userId, patientId, patientName, health, onNext, onBack }: HealthStepProps) {
  const updateHealth = useMutation(api.onboarding.updateHealth);
  const [conditions, setConditions] = useState<string[]>(health?.conditions ?? []);
  const [allergies, setAllergies] = useState<string[]>(health?.allergies ?? []);
  const [noKnownAllergies, setNoKnownAllergies] = useState(health?.noKnownAllergies ?? false);
  const [mobility, setMobility] = useState(health?.mobility ?? "");
  const [notes, setNotes] = useState(health?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const empty = !conditions.length && !allergies.length && !noKnownAllergies && !mobility && !notes.trim();

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateHealth({
        userId,
        patientId,
        health: { conditions, allergies, noKnownAllergies, mobility: mobility || undefined, notes: notes || undefined },
      });
      onNext();
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)}>
      <StepHeading
        kicker="Their health"
        sub={`Other conditions and allergies help Cadence ask ${patientName} the right questions and know which changes are worth flagging. Share what you know; you can add more later.`}
      >
        <em>Anything</em> else
        <br />
        we should know?
      </StepHeading>

      <div className="max-w-3xl space-y-10">
        <ChipPicker
          id="conditionOther"
          label="Other health conditions"
          options={COMMON_CONDITIONS}
          selected={conditions}
          onChange={setConditions}
          placeholder="Something else, e.g. thyroid condition"
        />

        <ChipPicker
          id="allergyOther"
          label="Allergies"
          options={noKnownAllergies ? [] : COMMON_ALLERGIES}
          selected={noKnownAllergies ? [] : allergies}
          onChange={(next) => {
            setNoKnownAllergies(false);
            setAllergies(next);
          }}
          placeholder="Something else, e.g. shellfish"
          extra={
            <button
              type="button"
              aria-pressed={noKnownAllergies}
              onClick={() => setNoKnownAllergies((v) => !v)}
              className={chipClass(noKnownAllergies)}
            >
              No known allergies
            </button>
          }
        />

        <div className="space-y-3">
          <p className="mono-label text-plum-muted">How do they get around right now?</p>
          <div role="radiogroup" aria-label="Mobility" className="grid gap-3 sm:grid-cols-2">
            {MOBILITY.map((m) => (
              <ChoiceCard
                key={m.id}
                title={m.label}
                body={m.body}
                selected={mobility === m.id}
                onSelect={() => setMobility(mobility === m.id ? "" : m.id)}
              />
            ))}
          </div>
        </div>

        <Field
          label="Anything else (optional)"
          htmlFor="healthNotes"
          hint="Hearing or vision trouble, recent falls, how they're sleeping. The band uses this as background only."
        >
          <TextArea
            id="healthNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Hard of hearing in the left ear. Fell once last spring."
          />
        </Field>

        <ErrorNote message={error} />
      </div>

      <StepActions>
        <TextButton type="button" onClick={onBack}>
          ← Back
        </TextButton>
        <PrimaryButton type="submit" disabled={saving}>
          {saving ? "Saving…" : empty ? "Skip for now" : "Save and continue"}
        </PrimaryButton>
      </StepActions>
    </form>
  );
}
