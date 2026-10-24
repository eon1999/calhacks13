"use client";

import { useQuery } from "convex/react";
import { useSyncExternalStore, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEMO_USER_KEY, useDemoIdentity } from "@/components/onboarding/use-demo-identity";
import { loadSetupProgress, SETUP_STORAGE_KEY } from "@/components/onboarding/setup-state";
import { OnboardingShell, SecondaryButton, StepHeading } from "@/components/onboarding/ui";
import { GlassButton } from "@/components/landing/glass-button";
import { BAND_STORAGE_KEY } from "@/components/wearable/use-band-pairing";

// Judge-facing walkthrough: set Cadence up for someone, pair the simulated
// band, make something happen, and get the text. Each step ticks itself off
// from live data, so it also works as a presenter's checklist.

const BAND_URL = "/hub?demo=1";

type Status = "todo" | "now" | "done";

// Setup progress lives in localStorage and changes in the /start tab, so
// re-read it whenever another tab writes (the `storage` event).
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readSetup(): string | null {
  try {
    return localStorage.getItem(SETUP_STORAGE_KEY);
  } catch {
    return null;
  }
}

function useSavedSetup() {
  const raw = useSyncExternalStore(subscribe, readSetup, () => null);
  // `raw` only gates re-reads; loadSetupProgress() does the validated parse.
  return raw ? loadSetupProgress() : null;
}

/** Forget this browser's setup, band and identity so the next person starts clean. */
function startOver(): void {
  if (!window.confirm("Start over? This browser forgets the setup, the band and who you are. Nothing is deleted on the server.")) {
    return;
  }
  for (const store of [localStorage, sessionStorage]) {
    try {
      [SETUP_STORAGE_KEY, BAND_STORAGE_KEY, DEMO_USER_KEY].forEach((key) => store.removeItem(key));
    } catch {
      // Storage blocked: nothing was saved, so there's nothing to clear.
    }
  }
  window.location.reload();
}

function Step({ n, status, title, children }: { n: number; status: Status; title: string; children: ReactNode }) {
  return (
    <li
      className={`rounded-3xl border p-6 transition-colors ${
        status === "now" ? "border-violet/40 bg-white/70 shadow-[0_10px_30px_-14px_rgb(113_20_255/0.45)]" : "border-plum/10 bg-white/40"
      }`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className={`mono-label ${status === "now" ? "text-violet" : "text-plum-muted"}`}>
          [{String(n).padStart(2, "0")}]
        </span>
        <span className={`mono-label ${status === "done" ? "text-violet" : "text-plum-muted/70"}`}>
          {status === "done" ? "Done ✓" : status === "now" ? "Up next" : "Later"}
        </span>
      </div>
      <h2 className="mt-3 font-display text-3xl">{title}</h2>
      <div className="mt-3 space-y-4 text-sm text-plum-muted">{children}</div>
    </li>
  );
}

export function DemoGuide() {
  const { identity } = useDemoIdentity();
  const saved = useSavedSetup();
  const patientId = saved?.patientId as Id<"patients"> | undefined;
  const args = identity && patientId ? { userId: identity.id, patientId } : "skip";
  const setup = useQuery(api.onboarding.setup, args);
  const overview = useQuery(api.notify.overview, args);

  const name = setup ? (setup.patient.preferredName ?? setup.patient.name.split(/\s+/)[0]) : null;
  const setUp = !!setup && saved?.step === "done";
  const paired = !!setup && setup.devices.length > 0;
  const me = overview?.recipients.find((r) => r.isMe);
  const lastAlertText = overview?.recent.find((t) => !t.test && t.status !== "skipped");
  const texted = lastAlertText?.status === "sent";

  const status = (done: boolean, ready: boolean): Status => (done ? "done" : ready ? "now" : "todo");

  return (
    <OnboardingShell label="Demo">
      <StepHeading
        kicker="Try Cadence"
        sub="You're the family. Set Cadence up for someone recovering from surgery, put the band on them, and see what happens when something goes wrong. About three minutes."
      >
        <em>Three steps</em> to
        <br />
        your first text
      </StepHeading>

      <ol className="max-w-2xl space-y-4">
        <Step n={1} status={status(setUp, true)} title="Set it up for someone">
          <p>
            Pick anyone: a parent, a friend, yourself. Put <strong className="text-plum">your own mobile</strong> on the
            first screen; that&apos;s where the alerts go.
          </p>
          {setup && <p className="text-plum">Set up for {name}.</p>}
          <GlassButton href="/start">{setup ? (setUp ? "Review setup" : "Continue setup") : "Start setup"}</GlassButton>
        </Step>

        <Step n={2} status={status(paired, !!setup)} title="Put the band on">
          <p>
            Open the band in a new tab. It shows a six-digit code; type it into the band step of setup. Then tap{" "}
            <em>First time on the wrist</em> and answer it.
          </p>
          {paired && <p className="text-plum">The band knows {name}.</p>}
          <a
            href={BAND_URL}
            target="_blank"
            rel="noreferrer"
            className="glass-pill inline-flex h-11 items-center gap-3 px-5 text-sm font-medium text-plum transition-transform duration-300 hover:scale-[1.03]"
          >
            Open the band ↗
          </a>
        </Step>

        <Step n={3} status={status(texted, paired)} title="Make something happen">
          <p>
            On the band, tap <em>Simulate a fall</em> or tell it &ldquo;the wound looks red&rdquo;. Cadence talks it
            through with {name ?? "them"}, then texts the family.
          </p>
          {me && !me.phone && (
            <p className="rounded-2xl border border-destructive/30 bg-white/70 px-4 py-3 text-destructive">
              You didn&apos;t add a mobile, so the text has nowhere to go. Add one on the band page&apos;s Text alerts card.
            </p>
          )}
          {lastAlertText && (
            <blockquote className="rounded-2xl border border-plum/10 bg-white/70 px-4 py-3 text-plum">
              <span className="mono-label block text-plum-muted">
                {lastAlertText.status === "sent" ? `Texted ${lastAlertText.to}` : `Couldn't text ${lastAlertText.to}`}
              </span>
              <span className="mt-1 block">{lastAlertText.body}</span>
              {lastAlertText.reason && <span className="mt-1 block text-xs text-plum-muted">{lastAlertText.reason}</span>}
            </blockquote>
          )}
        </Step>
      </ol>

      <div className="mt-12 flex max-w-2xl flex-wrap items-center justify-between gap-4 border-t border-plum/10 pt-8">
        <SecondaryButton type="button" onClick={startOver}>
          Start over for the next person
        </SecondaryButton>
        {overview && !overview.live && (
          <p className="mono-label text-plum-muted">Texting is a dry run on this deployment</p>
        )}
      </div>
    </OnboardingShell>
  );
}
