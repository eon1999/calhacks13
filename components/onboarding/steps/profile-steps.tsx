"use client";

import { useMemo, useState, type FormEvent } from "react";
import { localDateKey, PHASES, PROCEDURES, recoveryStatus } from "@/lib/onboarding/recovery";
import { RELATIONSHIPS } from "@/lib/onboarding/roles";
import { toE164 } from "@/lib/notify/phone";
import type { SetupDraft } from "../setup-state";
import {
  ChoiceCard,
  ErrorNote,
  Field,
  PrimaryButton,
  Select,
  StepActions,
  StepHeading,
  TextArea,
  TextButton,
  TextInput,
  Toggle,
} from "../ui";

export interface ProfileStepProps {
  draft: SetupDraft;
  updateDraft: (patch: Partial<SetupDraft>) => void;
  onNext: () => void;
  onBack?: () => void;
}

const LANGUAGES = ["English", "Spanish", "Mandarin Chinese", "Cantonese", "Vietnamese", "Tagalog", "Korean", "Hindi", "Arabic", "French"];

function submit(onNext: () => void) {
  return (e: FormEvent) => {
    e.preventDefault();
    onNext();
  };
}

export function YouStep({ draft, updateDraft, onNext }: ProfileStepProps) {
  const phoneOk = !draft.ownerPhone.trim() || toE164(draft.ownerPhone) !== null;
  const ready = draft.ownerName.trim().length > 0 && phoneOk;
  return (
    <form onSubmit={submit(onNext)}>
      <StepHeading
        kicker="Start here"
        sub="You'll set things up once: who it's for, their recovery, their medicines, and who should hear from the band. Takes about five minutes."
      >
        <em>First,</em> who&apos;s
        <br />
        setting up?
      </StepHeading>

      <div className="max-w-xl space-y-8">
        <Field label="Your name" htmlFor="ownerName">
          <TextInput
            id="ownerName"
            autoComplete="name"
            autoFocus
            value={draft.ownerName}
            onChange={(e) => updateDraft({ ownerName: e.target.value })}
            placeholder="Sarah Lee"
          />
        </Field>

        <Field
          label="Your mobile (optional)"
          htmlFor="ownerPhone"
          hint={phoneOk ? "Cadence texts you here if something's wrong. US numbers, or start with + and the country code." : "That doesn't look like a phone number."}
        >
          <TextInput
            id="ownerPhone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={draft.ownerPhone}
            onChange={(e) => updateDraft({ ownerPhone: e.target.value })}
            placeholder="(415) 555-0123"
          />
        </Field>

        <div className="space-y-2">
          <p className="mono-label text-plum-muted">You are their…</p>
          <div role="radiogroup" aria-label="Relationship" className="flex flex-wrap gap-2">
            {RELATIONSHIPS.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={draft.relationship === r}
                onClick={() => updateDraft({ relationship: r })}
                className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                  draft.relationship === r
                    ? "border-violet bg-violet text-white"
                    : "border-plum/15 bg-white/50 hover:border-plum/40"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <StepActions>
        <PrimaryButton type="submit" disabled={!ready}>
          Continue
        </PrimaryButton>
      </StepActions>
    </form>
  );
}

export function PatientStep({ draft, updateDraft, onNext, onBack }: ProfileStepProps) {
  const zones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  const ready = draft.patientName.trim().length > 0 && !!draft.timeZone;
  const firstName = draft.patientName.trim().split(/\s+/)[0] ?? "";

  return (
    <form onSubmit={submit(onNext)}>
      <StepHeading kicker="Who it's for" sub="The band talks to them out loud, so tell it how they like to be spoken to.">
        <em>Who</em> will wear
        <br />
        the band?
      </StepHeading>

      <div className="grid max-w-2xl gap-8 sm:grid-cols-2">
        <Field label="Their full name" htmlFor="patientName">
          <TextInput
            id="patientName"
            autoFocus
            value={draft.patientName}
            onChange={(e) => updateDraft({ patientName: e.target.value })}
            placeholder="Margaret Lee"
          />
        </Field>
        <Field label="What should the band call them?" htmlFor="preferredName" hint="Leave blank to use their first name.">
          <TextInput
            id="preferredName"
            value={draft.preferredName}
            onChange={(e) => updateDraft({ preferredName: e.target.value })}
            placeholder={firstName || "Maggie, Mom, Mrs. Lee…"}
          />
        </Field>
        <Field label="Language" htmlFor="language">
          <Select id="language" value={draft.language} onChange={(e) => updateDraft({ language: e.target.value })}>
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Their time zone" htmlFor="timeZone" hint="Medicine reminders follow this clock.">
          <Select id="timeZone" value={draft.timeZone} onChange={(e) => updateDraft({ timeZone: e.target.value })}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Toggle
            checked={draft.extraPatience}
            onChange={(extraPatience) => updateDraft({ extraPatience })}
            label="They need a little extra patience"
            body="Slower speech, one simple question at a time, and a gentle repeat if they seem unsure. Good for hard of hearing, tired, or a bit foggy after anaesthesia."
          />
        </div>
      </div>

      <StepActions>
        <TextButton type="button" onClick={onBack}>
          ← Back
        </TextButton>
        <PrimaryButton type="submit" disabled={!ready}>
          Continue
        </PrimaryButton>
      </StepActions>
    </form>
  );
}

export function RecoveryStep({
  draft,
  updateDraft,
  onNext,
  onBack,
  saving,
  error,
}: ProfileStepProps & { saving: boolean; error: string | null }) {
  const [now] = useState(() => Date.now());
  const name = draft.preferredName.trim() || draft.patientName.trim().split(/\s+/)[0] || "them";
  const status = draft.surgeryDate
    ? recoveryStatus(draft.surgeryDate, localDateKey(draft.timeZone, now))
    : null;
  const ready =
    !!draft.procedure && !!draft.surgeryDate && (draft.procedure !== "other" || draft.procedureOther.trim().length > 0);

  return (
    <form onSubmit={submit(onNext)}>
      <StepHeading
        kicker="Their recovery"
        sub={`Cadence adjusts what it asks ${name} about as the weeks go by: pain and warning signs early on, then strength, sleep and mood.`}
      >
        <em>What</em> are they
        <br />
        recovering from?
      </StepHeading>

      <div className="max-w-2xl space-y-10">
        <div role="radiogroup" aria-label="Procedure" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROCEDURES.map((p) => (
            <ChoiceCard
              key={p.id}
              title={p.label}
              selected={draft.procedure === p.id}
              onSelect={() => updateDraft({ procedure: p.id })}
            />
          ))}
        </div>

        {draft.procedure === "other" && (
          <Field label="What was the surgery?" htmlFor="procedureOther">
            <TextInput
              id="procedureOther"
              autoFocus
              value={draft.procedureOther}
              onChange={(e) => updateDraft({ procedureOther: e.target.value })}
              placeholder="Shoulder repair"
            />
          </Field>
        )}

        <div className="grid gap-8 sm:grid-cols-2">
          <Field label="Surgery date" htmlFor="surgeryDate">
            <TextInput
              id="surgeryDate"
              type="date"
              value={draft.surgeryDate}
              onChange={(e) => updateDraft({ surgeryDate: e.target.value })}
            />
          </Field>
          <Field label="Home from hospital (optional)" htmlFor="dischargeDate">
            <TextInput
              id="dischargeDate"
              type="date"
              min={draft.surgeryDate || undefined}
              value={draft.dischargeDate}
              onChange={(e) => updateDraft({ dischargeDate: e.target.value })}
            />
          </Field>
        </div>

        {status && (
          <div className="rounded-2xl border border-violet/30 bg-white/60 px-5 py-4">
            <p className="mono-label text-violet">{status.label}</p>
            <p className="mt-2 text-sm text-plum-muted">
              <span className="font-medium text-plum">What the band will watch for: </span>
              {PHASES[status.phase].focus}
            </p>
          </div>
        )}

        <Field
          label="Discharge instructions worth remembering (optional)"
          htmlFor="careNotes"
          hint="The band can remind them gently. It won't give medical advice."
        >
          <TextArea
            id="careNotes"
            value={draft.careNotes}
            onChange={(e) => updateDraft({ careNotes: e.target.value })}
            placeholder="No lifting over 10 lb. Keep the dressing dry. Walk three times a day."
          />
        </Field>

        <ErrorNote message={error} />
      </div>

      <StepActions>
        <TextButton type="button" onClick={onBack}>
          ← Back
        </TextButton>
        <PrimaryButton type="submit" disabled={!ready || saving}>
          {saving ? "Saving…" : "Save and continue"}
        </PrimaryButton>
      </StepActions>
    </form>
  );
}
