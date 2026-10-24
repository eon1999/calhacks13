"use client";

import { useQuery } from "convex/react";
import { useCallback, useSyncExternalStore } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// Which patient the care, settings and demo pages show. No auth yet
// (TODO(auth): the signed-in user's care-team patients), so it's a per-browser
// choice remembered in localStorage, defaulting to the demo patient.

const KEY = "cadence.patientId";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export type PatientSummary = NonNullable<ReturnType<typeof usePatients>>[number];

export function usePatients() {
  return useQuery(api.reports.patients, {});
}

/** The selected patient (falls back to the first, demo first), plus a setter. */
export function useSelectedPatient() {
  const patients = usePatients();
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const selected = patients?.find((p) => p._id === stored) ?? patients?.[0] ?? null;
  const select = useCallback((id: Id<"patients">) => {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // private mode: selection lasts for this page only
    }
    listeners.forEach((l) => l());
  }, []);
  return { patients, patient: selected, select, loading: patients === undefined };
}
