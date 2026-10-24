"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProcedureId } from "@/lib/onboarding/recovery";

export const STEPS = [
  { id: "you", label: "You" },
  { id: "patient", label: "Who it's for" },
  { id: "recovery", label: "Their recovery" },
  { id: "meds", label: "Medicines" },
  { id: "band", label: "The band" },
  { id: "team", label: "Care team" },
  { id: "done", label: "All set" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

export interface SetupDraft {
  ownerName: string;
  ownerPhone: string;
  relationship: string;
  patientName: string;
  preferredName: string;
  timeZone: string;
  language: string;
  extraPatience: boolean;
  procedure: ProcedureId | "";
  procedureOther: string;
  surgeryDate: string;
  dischargeDate: string;
  careNotes: string;
}

export interface SetupProgress {
  step: StepId;
  patientId: string | null;
  draft: SetupDraft;
  /** Steps the owner has moved past (completed or skipped). */
  visited: StepId[];
}

export const SETUP_STORAGE_KEY = "cadence.setup";

function emptyDraft(): SetupDraft {
  return {
    ownerName: "",
    ownerPhone: "",
    relationship: "",
    patientName: "",
    preferredName: "",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: "English",
    extraPatience: false,
    procedure: "",
    procedureOther: "",
    surgeryDate: "",
    dischargeDate: "",
    careNotes: "",
  };
}

function initial(): SetupProgress {
  return { step: "you", patientId: null, draft: emptyDraft(), visited: [] };
}

/** Saved wizard progress, or null. Read-only callers (the /demo guide) use this too. */
export function loadSetupProgress(): SetupProgress | null {
  try {
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SetupProgress>;
    if (!parsed.step || !STEPS.some((s) => s.id === parsed.step)) return null;
    return { ...initial(), ...parsed, draft: { ...emptyDraft(), ...parsed.draft } };
  } catch {
    return null;
  }
}

function save(progress: SetupProgress): void {
  try {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage blocked: setup still works, it just won't survive a refresh.
  }
}

/** Wizard progress, restored from localStorage so a refresh resumes where you left off. */
export function useSetupProgress() {
  const [progress, setProgress] = useState<SetupProgress>(initial);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const saved = loadSetupProgress();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore once from storage after hydration
    if (saved) setProgress(saved);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) save(progress);
  }, [progress, restored]);

  const updateDraft = useCallback((patch: Partial<SetupDraft>) => {
    setProgress((p) => ({ ...p, draft: { ...p.draft, ...patch } }));
  }, []);

  const goTo = useCallback((step: StepId) => {
    setProgress((p) => ({
      ...p,
      step,
      visited: p.visited.includes(p.step) ? p.visited : [...p.visited, p.step],
    }));
  }, []);

  const setPatientId = useCallback((patientId: string) => {
    setProgress((p) => ({ ...p, patientId }));
  }, []);

  const reset = useCallback(() => setProgress(initial()), []);

  return { ...progress, restored, updateDraft, goTo, setPatientId, reset };
}

export function nextStep(step: StepId): StepId {
  const i = STEPS.findIndex((s) => s.id === step);
  return STEPS[Math.min(i + 1, STEPS.length - 1)].id;
}

export function prevStep(step: StepId): StepId {
  const i = STEPS.findIndex((s) => s.id === step);
  return STEPS[Math.max(i - 1, 0)].id;
}
