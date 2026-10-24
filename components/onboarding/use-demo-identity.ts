"use client";

import { useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { ClerkUserIdContext } from "@/components/auth/clerk-identity";

// The signed-in Clerk user when there is one; otherwise a per-browser demo id
// kept in localStorage, so the demo works without an account.
// "Continue as someone new" (trying an invite on the same browser) sets a
// tab-only override in sessionStorage, so the owner's other tabs stay signed in.
// Convex resolves the caller from ctx.auth when signed in (convex/identity.ts),
// so the id passed here only matters for signed-out demo use.

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
export function useDemoIdentity(): { identity: DemoIdentity | null; startFresh: () => void } {
  const clerkUserId = useContext(ClerkUserIdContext);
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
  if (clerkUserId) return { identity: { id: clerkUserId }, startFresh };
  return { identity: raw ? { id: raw } : null, startFresh };
}
