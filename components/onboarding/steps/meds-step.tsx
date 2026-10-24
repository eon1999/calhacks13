"use client";

import { useMutation } from "convex/react";
import { Camera, LoaderCircle, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { downscaleToJpeg } from "../downscale-image";
import {
  ErrorNote,
  errorText,
  Field,
  PrimaryButton,
  SecondaryButton,
  StepActions,
  StepHeading,
  TextButton,
  TextInput,
} from "../ui";

const FREQUENCIES = [
  { label: "Once a day", times: ["08:00"] },
  { label: "Twice a day", times: ["08:00", "20:00"] },
  { label: "Three times a day", times: ["08:00", "14:00", "20:00"] },
  { label: "Every 6 hours", times: ["06:00", "12:00", "18:00", "00:00"] },
];

interface MedForm {
  name: string;
  doseLabel: string;
  times: string[];
}

const EMPTY_FORM: MedForm = { name: "", doseLabel: "", times: ["08:00"] };

interface MedsStepProps {
  userId: string;
  patientId: Id<"patients">;
  patientName: string;
  medications: Doc<"medications">[];
  onNext: () => void;
  onBack: () => void;
}

export function MedsStep({ userId, patientId, patientName, medications, onNext, onBack }: MedsStepProps) {
  const addMedication = useMutation(api.onboarding.addMedication);
  const removeMedication = useMutation(api.onboarding.removeMedication);
  const [form, setForm] = useState<MedForm>(EMPTY_FORM);
  const [newTime, setNewTime] = useState("12:00");
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const formReady = form.name.trim() && form.doseLabel.trim() && form.times.length > 0;

  async function scan(file: File) {
    setScanning(true);
    setError(null);
    setScanNote(null);
    try {
      const { base64, mediaType } = await downscaleToJpeg(file);
      const res = await fetch("/api/onboarding/scan-med", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType }),
      });
      const json = (await res.json().catch(() => null)) as
        | { success: true; data: { name: string; doseLabel: string; times: string[]; instructions: string } }
        | { success: false; error: string }
        | null;
      if (!json || !json.success) throw new Error(json && !json.success ? json.error : "Scan failed");
      const { name, doseLabel, times, instructions } = json.data;
      setForm({ name, doseLabel, times: times.length ? times : form.times });
      setScanNote(
        `Read from the label${instructions ? `: “${instructions}”` : ""}. Check it over before adding.${
          times.length ? "" : " It looks like an as-needed medicine, so pick the times you'd like reminders."
        }`,
      );
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setScanning(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!formReady) return;
    setSaving(true);
    setError(null);
    try {
      await addMedication({ userId, patientId, ...form });
      setForm(EMPTY_FORM);
      setScanNote(null);
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  function addTime() {
    if (!newTime || form.times.includes(newTime)) return;
    setForm((f) => ({ ...f, times: [...f.times, newTime].sort() }));
  }

  return (
    <div>
      <StepHeading
        kicker="Medicines"
        sub={`The band reminds ${patientName} out loud when each dose is due, and lets the care team know if one is missed. Snap the pharmacy label, or type it in.`}
      >
        <em>What</em> do they
        <br />
        take, and when?
      </StepHeading>

      <div className="grid max-w-4xl gap-10 xl:grid-cols-[1fr_300px]">
        <form onSubmit={(e) => void add(e)} className="space-y-6 rounded-3xl border border-plum/10 bg-white/45 p-6 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-2xl">Add a medicine</p>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Photo of the medicine label"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void scan(file);
              }}
            />
            <SecondaryButton type="button" onClick={() => fileInput.current?.click()} disabled={scanning}>
              {scanning ? <LoaderCircle className="size-4 animate-spin" /> : <Camera className="size-4" />}
              {scanning ? "Reading label…" : "Scan the label"}
            </SecondaryButton>
          </div>

          {scanNote && <p className="rounded-2xl bg-violet/10 px-4 py-3 text-sm text-plum">{scanNote}</p>}

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Medicine" htmlFor="medName">
              <TextInput
                id="medName"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Cephalexin"
              />
            </Field>
            <Field label="Dose" htmlFor="medDose">
              <TextInput
                id="medDose"
                value={form.doseLabel}
                onChange={(e) => setForm((f) => ({ ...f, doseLabel: e.target.value }))}
                placeholder="500 mg, 1 capsule"
              />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="mono-label text-plum-muted">How often</p>
            <div className="flex flex-wrap gap-2">
              {FREQUENCIES.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, times: f.times }))}
                  className="rounded-full border border-plum/15 bg-white/50 px-3 py-1.5 text-sm transition-colors hover:border-violet"
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {form.times.map((t) => (
                <span key={t} className="tag-pill">
                  {t}
                  <button
                    type="button"
                    aria-label={`Remove ${t}`}
                    onClick={() => setForm((f) => ({ ...f, times: f.times.filter((x) => x !== t) }))}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <span className="flex items-center gap-1">
                <input
                  type="time"
                  aria-label="Add a reminder time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="h-8 rounded-full border border-plum/15 bg-white/60 px-3 text-sm"
                />
                <TextButton type="button" onClick={addTime}>
                  + Add time
                </TextButton>
              </span>
            </div>
          </div>

          <ErrorNote message={error} />

          <SecondaryButton type="submit" disabled={!formReady || saving}>
            {saving ? "Adding…" : "Add to schedule"}
          </SecondaryButton>
        </form>

        <div>
          <p className="mono-label text-plum-muted">Their schedule</p>
          {medications.length === 0 ? (
            <p className="mt-4 text-sm text-plum-muted">Nothing yet. Painkillers, antibiotics and blood thinners are the usual ones after surgery.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {medications.map((m) => (
                <li key={m._id} className="group rounded-2xl border border-plum/10 bg-white/60 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-xl leading-tight">{m.name}</p>
                      <p className="text-sm text-plum-muted">{m.doseLabel}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${m.name}`}
                      onClick={() => void removeMedication({ userId, medicationId: m._id })}
                      className="rounded-full p-1 text-plum-muted transition-colors hover:bg-plum/5 hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <p className="mono-label mt-2 text-violet">{m.times.join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <StepActions>
        <TextButton type="button" onClick={onBack}>
          ← Back
        </TextButton>
        <PrimaryButton type="button" onClick={onNext}>
          {medications.length ? "Continue" : "Skip for now"}
        </PrimaryButton>
      </StepActions>
    </div>
  );
}
