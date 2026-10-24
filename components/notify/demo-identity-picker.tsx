"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { useDemoIdentity } from "@/components/onboarding/use-demo-identity";

/**
 * Shown when this browser isn't on any care team. There's no real sign-in yet
 * (TODO(auth)), so testers can look around as one of the seeded demo members.
 */
export function DemoIdentityPicker({ tone = "plum" }: { tone?: "plum" | "plain" }) {
  const demo = useQuery(api.seed.demoMembers, {});
  const { actAs } = useDemoIdentity();
  const button =
    tone === "plum"
      ? "glass-pill inline-flex h-10 items-center px-4 text-sm font-medium text-plum transition-transform hover:scale-[1.03]"
      : "rounded-md border px-2.5 py-1 text-xs hover:bg-muted";

  return (
    <div className="space-y-3">
      <p className={tone === "plum" ? "text-plum-muted" : "text-muted-foreground"}>
        This browser isn&apos;t on a care team yet.{" "}
        <Link href="/start" className="underline">
          Set up Cadence
        </Link>{" "}
        or open your invite link.
      </p>
      {demo && demo.length > 0 && (
        <div className="space-y-2">
          <p className={`mono-label ${tone === "plum" ? "text-plum-muted" : "text-muted-foreground"}`}>Demo: view as</p>
          <div className="flex flex-wrap gap-2">
            {demo.map((m) => (
              <button key={m.userId} type="button" className={button} onClick={() => actAs(m.userId)}>
                {m.name} · {m.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** "Viewing as Maria (demo) · Back to me", while a tab is acting as a seeded member. */
export function DemoIdentityBanner({ name }: { name?: string }) {
  const { identity, actAs } = useDemoIdentity();
  if (!identity?.id.startsWith("demo-seed-")) return null;
  return (
    <p className="mono-label text-plum-muted">
      Viewing as {name ?? identity.id.replace("demo-seed-", "")} (demo) ·{" "}
      <button type="button" className="underline hover:text-violet" onClick={() => actAs(null)}>
        back to me
      </button>
    </p>
  );
}
