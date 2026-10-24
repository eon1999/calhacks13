"use client";

import { useMutation, useQuery } from "convex/react";
import { Phone, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { ChipPicker } from "@/components/onboarding/steps/health-step";
import { MedicationEditor } from "@/components/onboarding/steps/meds-step";
import {
  ErrorNote,
  errorText,
  Field,
  PrimaryButton,
  SecondaryButton,
  TextButton,
  TextInput,
} from "@/components/onboarding/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { COMMON_CONDITIONS } from "@/lib/onboarding/health";
import { WatchListCard } from "./watch-list-card";

const STEPS = [
  { id: "conditions", label: "Conditions" },
  { id: "medications", label: "Medications" },
  { id: "contacts", label: "Emergency contacts" },
  { id: "done", label: "Done" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const MAX_CONTACTS = 5;
const RELATIONSHIPS = ["Daughter", "Son", "Spouse", "Partner", "Friend", "Neighbor", "Caregiver"];

interface PatientOnboardingProps {
  /** The patient the simulated band is talking to; undefined until one exists. */
  patientId?: string;
  loadError: string | null;
  onSeed: () => Promise<void>;
  /** Re-fetch the band's dose schedule after a medicine changes. */
  onMedsChanged: () => Promise<void>;
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/40 bg-lilac/90 p-5 text-plum shadow-[0_30px_80px_-30px_rgb(42_15_92/0.7)] backdrop-blur-md sm:p-7">
      {children}
    </div>
  );
}

/** Demo onboarding on /hub: conditions, medications and emergency contacts for the band's patient. */
export function PatientOnboarding({ patientId, loadError, onSeed, onMedsChanged }: PatientOnboardingProps) {
  const [seeding, setSeeding] = useState(false);

  if (!patientId) {
    return (
      <Panel>
        <p className="mono-label text-violet">Patient onboarding</p>
        <p className="mt-3 font-display text-3xl">No patient yet</p>
        <p className="mt-2 text-sm text-plum-muted">{loadError ?? "Create the demo patient to start onboarding."}</p>
        <PrimaryButton
          type="button"
          className="mt-6"
          disabled={seeding}
          onClick={() => {
            setSeeding(true);
            void onSeed().finally(() => setSeeding(false));
          }}
        >
          {seeding ? "Creating…" : "Create demo patient"}
        </PrimaryButton>
      </Panel>
    );
  }

  return <OnboardingSteps patientId={patientId as Id<"patients">} onMedsChanged={onMedsChanged} />;
}

function OnboardingSteps({ patientId, onMedsChanged }: { patientId: Id<"patients">; onMedsChanged: () => Promise<void> }) {
  const profile = useQuery(api.profile.get, { patientId });
  const setConditions = useMutation(api.profile.setConditions);
  const addMedication = useMutation(api.profile.addMedication);
  const removeMedication = useMutation(api.profile.removeMedication);
  const requestWatchList = useMutation(api.watchList.request);
  const [step, setStep] = useState<StepId>("conditions");
  const [error, setError] = useState<string | null>(null);

  if (profile === undefined) {
    return (
      <Panel>
        <p className="mono-label text-plum-muted">Loading profile…</p>
      </Panel>
    );
  }
  if (profile === null) {
    return (
      <Panel>
        <p className="mono-label text-plum-muted">This patient no longer exists. Refresh the page.</p>
      </Panel>
    );
  }

  const index = STEPS.findIndex((s) => s.id === step);
  const go = (id: StepId) => {
    setError(null);
    setStep(id);
  };

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(errorText(e));
      throw e;
    }
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="mono-label text-violet">Patient onboarding</p>
        <p className="mono-label text-plum-muted">For {profile.name}</p>
      </div>

      <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-b border-plum/10 pb-4">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              aria-current={s.id === step ? "step" : undefined}
              onClick={() => go(s.id)}
              className={`mono-label transition-colors hover:text-violet ${s.id === step ? "text-plum" : "text-plum-muted"}`}
            >
              <span className={s.id === step ? "text-violet" : ""}>[{String(i + 1).padStart(2, "0")}]</span> {s.label}
            </button>
          </li>
        ))}
      </ol>

      <div key={step} className="mt-6 animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
        {step === "conditions" && (
          <section className="space-y-4">
            <h2 className="display text-4xl">
              <em>What</em> conditions do they have?
            </h2>
            <p className="text-sm text-plum-muted">
              Tap any that apply. The band uses these to decide what to ask about and which changes to flag.
            </p>
            <ChipPicker
              id="hubConditionOther"
              label="Health conditions"
              options={COMMON_CONDITIONS}
              selected={profile.conditions}
              onChange={(conditions) => void run(() => setConditions({ patientId, conditions })).catch(() => {})}
              placeholder="Something else, e.g. thyroid condition"
            />
          </section>
        )}

        {step === "medications" && (
          <section className="space-y-4">
            <h2 className="display text-4xl">
              <em>Which</em> medicines, and when?
            </h2>
            <p className="text-sm text-plum-muted">
              Each one shows up on the band&apos;s schedule below, and the band reminds {profile.name} out loud.
            </p>
            <MedicationEditor
              stacked
              medications={profile.medications}
              listLabel="On the schedule"
              onAdd={async (med) => {
                await addMedication({ patientId, ...med });
                await onMedsChanged();
              }}
              onRemove={async (medicationId) => {
                await removeMedication({ medicationId });
                await onMedsChanged();
              }}
            />
          </section>
        )}

        {step === "contacts" && (
          <EmergencyContacts patientId={patientId} name={profile.name} contacts={profile.emergencyContacts} run={run} />
        )}

        {step === "done" && (
          <section className="space-y-5">
            <h2 className="display text-4xl">
              <em>{profile.name}</em> is set up
            </h2>
            <dl className="divide-y divide-plum/10 border-y border-plum/10">
              {[
                { label: "Conditions", value: profile.conditions.length ? profile.conditions.join(", ") : "None listed", to: "conditions" as const },
                { label: "Medications", value: `${profile.medications.length} on the schedule`, to: "medications" as const },
                {
                  label: "Emergency contacts",
                  value: profile.emergencyContacts.length ? profile.emergencyContacts.map((c) => c.name).join(", ") : "None yet",
                  to: "contacts" as const,
                },
              ].map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="mono-label shrink-0 text-plum-muted">{r.label}</dt>
                  <dd className="flex items-baseline gap-2 text-right">
                    <span className="text-sm">{r.value}</span>
                    <TextButton type="button" onClick={() => go(r.to)}>
                      Edit
                    </TextButton>
                  </dd>
                </div>
              ))}
            </dl>
            <WatchListCard patientId={patientId} />
            <p className="text-sm text-plum-muted">
              Try it on the band below: ask &ldquo;Who should I call if I fall?&rdquo; or wait for the next dose reminder.
            </p>
          </section>
        )}
      </div>

      <ErrorNote message={error} />

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-plum/10 pt-5">
        <TextButton type="button" disabled={index === 0} onClick={() => go(STEPS[Math.max(index - 1, 0)].id)}>
          ← Back
        </TextButton>
        {step === "done" ? (
          <TextButton type="button" onClick={() => go("conditions")}>
            Start over
          </TextButton>
        ) : (
          <PrimaryButton
            type="button"
            onClick={() => {
              const finishing = index === STEPS.length - 2;
              // Setup is done: research what the band should watch for in the background.
              if (finishing) void run(() => requestWatchList({ patientId })).catch(() => {});
              go(STEPS[index + 1].id);
            }}
          >
            {index === STEPS.length - 2 ? "Finish" : "Continue"}
          </PrimaryButton>
        )}
      </div>
    </Panel>
  );
}

interface Contact {
  name: string;
  relationship?: string;
  phone: string;
}

function EmergencyContacts({
  patientId,
  name,
  contacts,
  run,
}: {
  patientId: Id<"patients">;
  name: string;
  contacts: Contact[];
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const setEmergencyContacts = useMutation(api.profile.setEmergencyContacts);
  const [form, setForm] = useState<Contact>({ name: "", relationship: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const full = contacts.length >= MAX_CONTACTS;
  const ready = form.name.trim() && form.phone.trim() && !full;

  const save = (next: Contact[]) => run(() => setEmergencyContacts({ patientId, contacts: next }));

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      await save([...contacts, { ...form, relationship: form.relationship || undefined }]);
      setForm({ name: "", relationship: "", phone: "" });
    } catch {
      // shown by run()
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <h2 className="display text-4xl">
        <em>Who</em> should we call?
      </h2>
      <p className="text-sm text-plum-muted">
        The people to reach if {name} falls or needs help. The band can tell {name} who these are; 911 always comes first.
      </p>

      {contacts.length > 0 && (
        <ol className="space-y-2">
          {contacts.map((c, i) => (
            <li key={`${c.name}-${c.phone}`} className="flex items-center justify-between gap-3 rounded-2xl border border-plum/10 bg-white/60 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="mono-label text-violet">{i + 1}</span>
                <div>
                  <p className="font-display text-xl leading-tight">
                    {c.name}
                    {c.relationship && <span className="text-base text-plum-muted"> · {c.relationship}</span>}
                  </p>
                  <p className="mono-label mt-1 flex items-center gap-1.5 text-plum-muted">
                    <Phone className="size-3" /> {c.phone}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label={`Remove ${c.name}`}
                onClick={() => void save(contacts.filter((_, j) => j !== i)).catch(() => {})}
                className="rounded-full p-1 text-plum-muted transition-colors hover:bg-plum/5 hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )}

      {full ? (
        <p className="text-sm text-plum-muted">That&apos;s the maximum of {MAX_CONTACTS}. Remove one to add another.</p>
      ) : (
        <form onSubmit={(e) => void add(e)} className="space-y-4 rounded-3xl border border-plum/10 bg-white/45 p-5">
          <p className="font-display text-2xl">Add a contact</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="contactName">
              <TextInput
                id="contactName"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Sarah Lee"
              />
            </Field>
            <Field label="Phone" htmlFor="contactPhone">
              <TextInput
                id="contactPhone"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="(555) 010-2030"
              />
            </Field>
          </div>
          <div className="space-y-2">
            <p className="mono-label text-plum-muted">Relationship (optional)</p>
            <div className="flex flex-wrap gap-2">
              {RELATIONSHIPS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={form.relationship === r}
                  onClick={() => setForm((f) => ({ ...f, relationship: f.relationship === r ? "" : r }))}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    form.relationship === r ? "border-violet bg-violet text-white" : "border-plum/15 bg-white/50 hover:border-plum/40"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <SecondaryButton type="submit" disabled={!ready || saving}>
            {saving ? "Adding…" : "Add contact"}
          </SecondaryButton>
        </form>
      )}
    </section>
  );
}
