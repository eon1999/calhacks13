"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

// Stand-in for Clerk until keys exist: a per-browser id kept in localStorage.
// "Continue as someone new" (trying an invite on the same browser) sets a
// tab-only override in sessionStorage, so the owner's other tabs stay signed in.
// TODO(auth): replace with Clerk's useUser(); Convex functions then read
// ctx.auth instead of taking a userId argument.

const KEY = "cadence.demoUser";
const listeners = new Set<() => void>();
const memory: { local: string | null; tab: string | null } = { local: null, tab: null };

export interface DemoIdentity {
  id: string;
}

function get(store: () => Storage): string | null {
  try {
    return store().getItem(KEY);
  } catch {
    return null;
  }
}

function set(store: () => Storage, value: string): void {
  try {
    store().setItem(KEY, value);
  } catch {
    // Private mode: the id lives for this page only.
  }
}

function snapshot(): string | null {
  return get(() => sessionStorage) ?? memory.tab ?? get(() => localStorage) ?? memory.local;
}

function notify(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function newId(): string {
  return `demo-${crypto.randomUUID()}`;
}

/** The current demo user, created on first use. `null` during SSR. */
export function useDemoIdentity(): {
  identity: DemoIdentity | null;
  startFresh: () => void;
  /** Demo only: act as a seeded team member in this tab, or `null` to go back to this browser's own identity. */
  actAs: (userId: string | null) => void;
} {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  useEffect(() => {
    if (snapshot()) return;
    memory.local = newId();
    set(() => localStorage, memory.local);
    notify();
  }, []);
  const startFresh = useCallback(() => {
    memory.tab = newId();
    set(() => sessionStorage, memory.tab);
    notify();
  }, []);
  const actAs = useCallback((userId: string | null) => {
    memory.tab = userId;
    try {
      if (userId) sessionStorage.setItem(KEY, userId);
      else sessionStorage.removeItem(KEY);
    } catch {
      // Private mode: memory.tab still applies to this page.
    }
    notify();
  }, []);
  return { identity: raw ? { id: raw } : null, startFresh, actAs };
}
