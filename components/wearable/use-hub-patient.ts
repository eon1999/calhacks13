"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "cadence.hub.patientId";

/**
 * The patient created for the /hub demo, remembered in this browser so a
 * refresh keeps it. `patientId` is null until one is created.
 */
export function useHubPatient() {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      // Storage blocked: the demo patient just won't survive a refresh.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore once from storage after hydration
    if (saved) setPatientId(saved);
    setRestored(true);
  }, []);

  const choose = useCallback((id: string | null) => {
    setPatientId(id);
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      // Storage blocked: fine for this session.
    }
  }, []);

  return { patientId, restored, choose };
}
