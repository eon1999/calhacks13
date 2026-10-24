"use client";

import { useCallback, useEffect, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type DebugActivity = FunctionReturnType<typeof api.debug.activity>;

/** Fetches what the agent/wearable wrote to Convex; refetches when `refreshKey` changes. */
export function useDebugActivity(patientId: string | undefined, refreshKey: unknown) {
  const [activity, setActivity] = useState<DebugActivity | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!patientId) return;
    try {
      const res = await fetch(`/api/debug/activity?patientId=${encodeURIComponent(patientId)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { success: boolean; data?: DebugActivity; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? `Request failed (${res.status})`);
      setActivity(json.data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load activity");
    }
  }, [patientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on change
    void refresh();
  }, [refresh, refreshKey]);

  return { activity, error, refresh };
}
