"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { GlassButton } from "@/components/landing/glass-button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { localDateKey, procedureId, procedureLabel, recoveryStatus } from "@/lib/onboarding/recovery";
import { ROLES, type CareRole } from "@/lib/onboarding/roles";
import { ErrorNote, errorText, Field, OnboardingShell, PrimaryButton, StepHeading, TextButton, TextInput } from "./ui";
import { useDemoIdentity } from "./use-demo-identity";

function landingFor(role: CareRole, patientId: Id<"patients">): string {
  // TODO: /care is still a stub; the patient view and caregiver checklist will get their own routes.
  return role === "clinician" ? `/clinician/${patientId}` : "/care";
}

/** First-login intro: exactly what this person will and won't be told about. */
function RoleIntro({ role, patientName, patientId }: { role: CareRole; patientName: string; patientId: Id<"patients"> }) {
  const info = ROLES[role];
  return (
    <div>
      <StepHeading kicker={`Joined as ${info.title}`} sub={`Here's what Cadence will tell you about ${patientName}.`}>
        <em>You&apos;re</em> on
        <br />
        {patientName}&apos;s team
      </StepHeading>
      <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
        <div className="rounded-3xl border border-violet/30 bg-white/60 p-6">
          <p className="mono-label text-violet">You&apos;ll get</p>
          <ul className="mt-4 space-y-3">
            {info.gets.map((g) => (
              <li key={g} className="flex gap-3 text-sm">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet" />
                {g}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl border border-plum/10 bg-white/35 p-6">
          <p className="mono-label text-plum-muted">You won&apos;t get</p>
          <ul className="mt-4 space-y-3">
            {info.doesNotGet.map((g) => (
              <li key={g} className="flex gap-3 text-sm text-plum-muted">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-plum/25" />
                {g}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-12">
        <GlassButton href={landingFor(role, patientId)}>Continue</GlassButton>
      </div>
    </div>
  );
}

export function JoinFlow({ token }: { token: string }) {
  const { identity, startFresh } = useDemoIdentity();
  const [now] = useState(() => Date.now());
  const invite = useQuery(api.invites.get, identity ? { token, userId: identity.id, now } : "skip");
  const accept = useMutation(api.invites.accept);
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!identity || invite === undefined) {
    return (
      <OnboardingShell>
        <p className="mono-label text-plum-muted">Loading invite…</p>
      </OnboardingShell>
    );
  }

  if (invite === null || invite.status === "used" || invite.status === "expired") {
    const message =
      invite === null
        ? "This invite link isn't valid."
        : invite.status === "used"
          ? "Someone has already used this invite."
          : "This invite has expired.";
    return (
      <OnboardingShell>
        <StepHeading kicker="Invite" sub="Ask the person who invited you to send a fresh link.">
          {message}
        </StepHeading>
        <Link href="/" className="mono-label text-plum-muted hover:text-violet">
          ← Back to Cadence
        </Link>
      </OnboardingShell>
    );
  }

  if (invite.status === "joined") {
    return (
      <OnboardingShell>
        <RoleIntro role={invite.role} patientName={invite.patientName} patientId={invite.patientId} />
      </OnboardingShell>
    );
  }

  const info = ROLES[invite.role];
  const recovery = invite.recovery;
  const recoveryLine = recovery
    ? `${(() => {
        const parsed = procedureId.safeParse(recovery.procedure);
        return parsed.success ? procedureLabel(parsed.data, recovery.procedureOther) : recovery.procedure;
      })()} · ${recoveryStatus(recovery.surgeryDate, localDateKey(invite.timeZone, now)).label}`
    : null;
  const inviter = invite.inviterRelationship
    ? `${invite.inviterName} (${invite.patientName}'s ${invite.inviterRelationship.toLowerCase()})`
    : invite.inviterName;
  const yourName = name ?? invite.name;
  const isPatient = invite.role === "patient";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!identity) return;
    setSaving(true);
    setError(null);
    try {
      await accept({ token, userId: identity.id, name: yourName });
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <OnboardingShell>
      <form onSubmit={(e) => void submit(e)}>
        <StepHeading
          kicker={isPatient ? "Your Cadence" : `Invited as ${info.title}`}
          sub={
            isPatient
              ? `${inviter} set up Cadence to help while you recover. This gives you your own view, and you decide who's on your team.`
              : `${inviter} invited you to help with ${invite.patientName}'s recovery. ${info.blurb}`
          }
        >
          {isPatient ? (
            <>
              <em>Hi</em> {invite.patientName}
            </>
          ) : (
            <>
              <em>Join</em> {invite.patientName}&apos;s
              <br />
              care team
            </>
          )}
        </StepHeading>

        {recoveryLine && <p className="mono-label mb-8 text-violet">{recoveryLine}</p>}

        {invite.alreadyMemberAs && (
          <div className="mb-8 max-w-xl rounded-2xl border border-plum/15 bg-white/60 px-5 py-4 text-sm">
            This browser is already signed in as <strong>{invite.alreadyMemberAs.name || "a team member"}</strong> on{" "}
            {invite.patientName}&apos;s team. To try the invite as the new person, switch identities.
            <div className="mt-3">
              <TextButton type="button" onClick={startFresh} className="!px-0 text-violet">
                Continue as someone new →
              </TextButton>
            </div>
          </div>
        )}

        <div className="max-w-md space-y-6">
          <Field label="Your name" htmlFor="joinName">
            <TextInput id="joinName" autoComplete="name" value={yourName} onChange={(e) => setName(e.target.value)} />
          </Field>
          <ErrorNote message={error} />
          <PrimaryButton type="submit" disabled={!yourName.trim() || saving || !!invite.alreadyMemberAs}>
            {saving ? "Joining…" : isPatient ? "Open my view" : "Join the team"}
          </PrimaryButton>
          <p className="text-xs text-plum-muted">
            Demo sign-in: your identity is kept in this browser. Real accounts (Clerk) come next.
          </p>
        </div>
      </form>
    </OnboardingShell>
  );
}
