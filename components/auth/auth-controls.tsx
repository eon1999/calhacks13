"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/clerk";

/** Sign in / sign up, or the user menu. Renders nothing until Clerk keys are set. */
export function AuthControls({ tone = "light" }: { tone?: "light" | "dark" }) {
  if (!clerkEnabled) return null;
  const button =
    tone === "dark"
      ? "rounded-full border border-white/30 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
      : "rounded-full border border-plum/15 bg-white px-4 py-2 text-sm font-medium text-plum hover:bg-lilac";
  return (
    <div className="flex items-center gap-2 print:hidden">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button type="button" className={button}>
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button type="button" className={`${button} bg-plum text-white hover:bg-plum/90`}>
            Sign up
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  );
}
