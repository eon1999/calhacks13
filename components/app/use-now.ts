"use client";

import { useEffect, useState } from "react";

/**
 * The current time, ticking every `stepMs` and rounded down to it, so Convex
 * queries that take `now` resubscribe at most once per step.
 */
export function useNow(stepMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / stepMs) * stepMs);
    tick();
    const id = setInterval(tick, Math.min(stepMs, 10_000));
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}
