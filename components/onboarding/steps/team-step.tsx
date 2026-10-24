"use client";

import { useMutation } from "convex/react";
import { Check, Copy, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { INVITABLE_ROLES, ROLES, type CareRole } from "@/lib/onboarding/roles";
import {
  ChoiceCard,
  ErrorNote,
  errorText,
  Field,
  PrimaryButton,
  SecondaryButton,
  StepActions,
  StepHeading,
  TextButton,
  TextInput,
} from "../ui";

interface Member {
  _id: string;
  name: string;
  role: CareRole;
  relationship?: string;
  isOwner: boolean;
}

interface PendingInvite {
  _id: Id<"invites">;
  name: string;
  role: CareRole;
  token: string;
}

interface TeamStepProps {
  userId: string;
  patientId: Id<"patients">;
  patientName: string;
  members: Member[];
  pendingInvites: PendingInvite[];
  onNext: () => void;
  onBack: () => void;
}

function inviteUrl(token: string): string {
  return `${window.location.origin}/join/${token}`;
}

function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(inviteUrl(token)).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
      className="mono-label inline-flex items-center gap-1.5 rounded-full bg-violet/10 px-3 py-1.5 text-violet transition-colors hover:bg-violet/20"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy invite link"}
    </button>
  );
}

export function TeamStep({ userId, patientId, patientName, members, pendingInvites, onNext, onBack }: TeamStepProps) {
  const createInvite = useMutation(api.invites.create);
  const revokeInvite = useMutation(api.invites.revoke);
  const [role, setRole] = useState<CareRole>("care_partner");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastToken, setLastToken] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const token = await createInvite({ userId, patientId, role, name, contact: contact || undefined });
      setLastToken(token);
      setName("");
      setContact("");
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const hasPatient = members.some((m) => m.role === "patient") || pendingInvites.some((i) => i.role === "patient");

  return (
    <div>
      <StepHeading
        kicker="Care team"
        sub={`Invite the people who help ${patientName}. Each person only hears about what their role needs, so a doctor won't get paged at 2 AM.`}
      >
        <em>Who</em> else should
        <br />
        be in the loop?
      </StepHeading>

      <div className="grid max-w-5xl gap-10 xl:grid-cols-[1fr_320px]">
        <form onSubmit={(e) => void submit(e)} className="space-y-6 rounded-3xl border border-plum/10 bg-white/45 p-6 backdrop-blur-sm">
          <div role="radiogroup" aria-label="Role" className="grid gap-3 sm:grid-cols-2">
            {INVITABLE_ROLES.map((r) => (
              <ChoiceCard
                key={r}
                selected={role === r}
                onSelect={() => setRole(r)}
                title={r === "patient" ? `${patientName} themself` : ROLES[r].title}
                body={ROLES[r].blurb}
              />
            ))}
          </div>
          {role === "patient" && (
            <p className="text-sm text-plum-muted">
              Optional. The band works on its own; this gives {patientName} a simple app view and lets them manage who&apos;s on
              their team.
            </p>
          )}
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Their name" htmlFor="inviteName">
              <TextInput
                id="inviteName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={role === "clinician" ? "Dr. Patel" : role === "caregiver" ? "Maria" : "Tom"}
              />
            </Field>
            <Field label="Email or phone (optional)" htmlFor="inviteContact" hint="For your records. You share the link yourself.">
              <TextInput id="inviteContact" value={contact} onChange={(e) => setContact(e.target.value)} />
            </Field>
          </div>
          <ErrorNote message={error} />
          <div className="flex flex-wrap items-center gap-3">
            <SecondaryButton type="submit" disabled={!name.trim() || saving}>
              {saving ? "Creating…" : "Create invite"}
            </SecondaryButton>
            {lastToken && <CopyLink token={lastToken} />}
          </div>
        </form>

        <div className="space-y-8">
          <div>
            <p className="mono-label text-plum-muted">On the team</p>
            <ul className="mt-3 space-y-2">
              {members.map((m) => (
                <li key={m._id} className="flex items-baseline justify-between gap-3 border-b border-plum/10 pb-2">
                  <span className="font-display text-xl">{m.name}</span>
                  <span className="mono-label text-plum-muted">
                    {m.isOwner ? "You · " : ""}
                    {m.relationship ?? ROLES[m.role].title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {pendingInvites.length > 0 && (
            <div>
              <p className="mono-label text-plum-muted">Invited, not joined yet</p>
              <ul className="mt-3 space-y-3">
                {pendingInvites.map((i) => (
                  <li key={i._id} className="rounded-2xl border border-dashed border-plum/20 bg-white/40 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display text-xl leading-tight">{i.name}</p>
                        <p className="mono-label text-plum-muted">{ROLES[i.role].title}</p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Cancel invite for ${i.name}`}
                        onClick={() => void revokeInvite({ userId, inviteId: i._id })}
                        className="rounded-full p-1 text-plum-muted hover:text-destructive"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    <div className="mt-2">
                      <CopyLink token={i.token} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!hasPatient && (
            <p className="text-sm text-plum-muted">
              Tip: {patientName} can have their own view too. Choose “{patientName} themself” above.
            </p>
          )}
        </div>
      </div>

      <StepActions>
        <TextButton type="button" onClick={onBack}>
          ← Back
        </TextButton>
        <PrimaryButton type="button" onClick={onNext}>
          {members.length + pendingInvites.length > 1 ? "Finish" : "Do this later"}
        </PrimaryButton>
      </StepActions>
    </div>
  );
}
