"use client";

import { useCallback, useSyncExternalStore } from "react";

// Who is acknowledging alerts. No auth yet (TODO(auth): Clerk user name), so
// the care partner types it once and this browser remembers it.

const KEY = "cadence.ackName";
const DEFAULT = "Sarah";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) || DEFAULT;
  } catch {
    return DEFAULT;
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

export function useAckName(): [string, (name: string) => void] {
  const name = useSyncExternalStore(subscribe, read, () => DEFAULT);
  const set = useCallback((value: string) => {
    try {
      localStorage.setItem(KEY, value.trim().slice(0, 40) || DEFAULT);
    } catch {
      // private mode: keeps the default
    }
    listeners.forEach((l) => l());
  }, []);
  return [name, set];
}
