"use client";

import { useUser } from "@clerk/nextjs";
import { createContext, type ReactNode } from "react";

/**
 * The signed-in Clerk user's id: a string when signed in, null when signed
 * out, undefined while Clerk loads or when Clerk isn't configured.
 */
export const ClerkUserIdContext = createContext<string | null | undefined>(undefined);

/** Rendered inside ClerkProvider (app/layout.tsx) so useDemoIdentity can see the Clerk user. */
export function ClerkIdentityBridge({ children }: { children: ReactNode }) {
  const { isLoaded, user } = useUser();
  return (
    <ClerkUserIdContext.Provider value={isLoaded ? (user?.id ?? null) : undefined}>{children}</ClerkUserIdContext.Provider>
  );
}
