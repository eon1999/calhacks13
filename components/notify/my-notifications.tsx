"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CareNav } from "@/components/care/care-nav";
import { DemoIdentityBanner, DemoIdentityPicker } from "@/components/notify/demo-identity-picker";
import { PreferencesEditor } from "@/components/notify/preferences-editor";
import { ErrorNote, errorText, OnboardingShell, SecondaryButton, StepHeading, TextInput } from "@/components/onboarding/ui";
import { useDemoIdentity } from "@/components/onboarding/use-demo-identity";
import { toE164 } from "@/lib/notify/phone";
import type { NotificationPreferences } from "@/lib/notify/preferences";

/** /settings: each care team this browser is on, with its own "how much should Cadence text me" choice. */
export function MyNotifications() {
  const { identity } = useDemoIdentity();
  const rows = useQuery(api.notify.myNotifications, identity ? { userId: identity.id } : "skip");
  const setPrefs = useMutation(api.notify.setNotificationPreferences);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function save(memberId: Id<"careTeamMembers">, preferences: NotificationPreferences) {
    if (!identity) return;
    setError(null);
    try {
      await setPrefs({ userId: identity.id, memberId, preferences });
      setSaved(memberId);
    } catch (e: unknown) {
      setError(errorText(e));
    }
  }

  return (
    <OnboardingShell label="Settings" aside={<CareNav current="settings" />}>
      <StepHeading
        kicker="My notifications"
        sub="Choose how much Cadence texts you. Most people never need more than the recommended setting."
      >
        <em>Texts</em> that help, not nag
      </StepHeading>
      <DemoIdentityBanner name={rows?.[0]?.name} />
      <ErrorNote message={error} />

      {rows === undefined && <p className="text-plum-muted">Loading…</p>}
      {rows?.length === 0 && <DemoIdentityPicker />}

      <div className="mt-6 space-y-12">
        {rows?.map((row) => (
          <section key={row.memberId} className="space-y-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-plum/10 pb-3">
              <h2 className="font-display text-3xl">For {row.patientName}</h2>
              {saved === row.memberId && <span className="mono-label text-violet">Saved ✓</span>}
            </div>
            {row.texted ? (
              <>
                <PhoneRow memberId={row.memberId} phone={row.phone} />
                <PreferencesEditor
                  preferences={row.preferences}
                  onChange={(next) => void save(row.memberId, next)}
                  patientName={row.patientName}
                  isOwner={row.isOwner}
                  hasSummaryPermission={row.hasSummaryPermission}
                />
              </>
            ) : (
              <p className="text-plum-muted">
                {row.role === "clinician" ? (
                  <>
                    Doctors get a recovery report, not texts.{" "}
                    <Link className="underline" href={`/clinician/${row.patientId}`}>
                      Open the report
                    </Link>
                    .
                  </>
                ) : (
                  "Cadence doesn't text you about yourself. Your care team gets the alerts."
                )}
              </p>
            )}
          </section>
        ))}
      </div>
    </OnboardingShell>
  );
}

function PhoneRow({ memberId, phone }: { memberId: Id<"careTeamMembers">; phone: string | null }) {
  const { identity } = useDemoIdentity();
  const setPhone = useMutation(api.notify.setMemberPhone);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!identity) return;
    try {
      await setPhone({ userId: identity.id, memberId, phone: draft });
      setEditing(false);
      setError(null);
    } catch (err: unknown) {
      setError(errorText(err));
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="mono-label text-plum-muted">Texts go to</span>
        <span className="font-mono">{phone ?? "no number yet"}</span>
        <SecondaryButton type="button" onClick={() => {
            setEditing(true);
            setDraft("");
          }}>
          {phone ? "Change" : "Add your mobile"}
        </SecondaryButton>
        {!phone && <span className="text-sm text-plum-muted">Without a number, Cadence can&apos;t text you at all.</span>}
      </div>
    );
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-wrap items-center gap-2">
      <TextInput
        type="tel"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="(415) 555-0123"
        aria-label="Your mobile number"
        className="max-w-xs"
      />
      <SecondaryButton type="submit" disabled={!!draft.trim() && !toE164(draft)}>
        {draft.trim() ? "Save" : "Remove"}
      </SecondaryButton>
      <SecondaryButton type="button" onClick={() => setEditing(false)}>
        Cancel
      </SecondaryButton>
      <ErrorNote message={error} />
    </form>
  );
}
