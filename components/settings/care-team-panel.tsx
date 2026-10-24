"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { Panel } from "@/components/app/app-shell";
import { useNow } from "@/components/app/use-now";
import { ErrorNote, errorText, SecondaryButton, Select, TextButton, TextInput } from "@/components/onboarding/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { INVITABLE_ROLES, ROLES, type CareRole, type Permission } from "@/lib/onboarding/roles";

interface Member {
  _id: Id<"careTeamMembers">;
  name: string;
  role: CareRole;
  relationship?: string;
  permissions: Permission[];
  urgentAlerts: boolean;
  isOwner: boolean;
}

interface Invite {
  _id: Id<"invites">;
  name: string;
  role: CareRole;
  token: string;
  expiresAt: number;
}

const PERMISSIONS: { id: Permission; label: string }[] = [
  { id: "alerts", label: "Alerts" },
  { id: "summary", label: "Daily summary" },
  { id: "report", label: "Clinician report" },
];

export function CareTeamPanel({
  userId,
  patientId,
  members,
  invites,
}: {
  userId: string;
  patientId: Id<"patients">;
  members: Member[];
  invites: Invite[];
}) {
  const revokeInvite = useMutation(api.invites.revoke);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const now = useNow();

  async function copyLink(token: string) {
    const url = `${window.location.origin}/join/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
    } catch {
      prompt("Copy this invite link", url);
    }
  }

  return (
    <Panel title="Care team and permissions">
      <p className="mb-5 max-w-prose text-sm text-plum-muted">
        The patient decides who is on the team and what each person sees. Family get alerts and summaries; doctors get reports.
        Access can be taken away at any time.
      </p>
      <ul className="space-y-3">
        {members.map((m) => (
          <MemberRow key={m._id} userId={userId} member={m} onError={setError} />
        ))}
      </ul>

      {invites.length > 0 && (
        <div className="mt-6">
          <p className="mono-label text-plum-muted">Waiting to join</p>
          <ul className="mt-3 space-y-2">
            {invites.map((i) => (
              <li key={i._id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-plum/20 px-4 py-3">
                <span>
                  <strong>{i.name}</strong> · {ROLES[i.role].title}
                  <span className="text-sm text-plum-muted">
                    {" "}
                    · {now !== null && i.expiresAt < now ? "expired" : `expires ${new Date(i.expiresAt).toLocaleDateString()}`}
                  </span>
                </span>
                <span className="flex gap-1">
                  <TextButton type="button" onClick={() => void copyLink(i.token)}>
                    {copied === i.token ? "Copied ✓" : "Copy link"}
                  </TextButton>
                  <TextButton
                    type="button"
                    onClick={() => revokeInvite({ userId, inviteId: i._id }).catch((e: unknown) => setError(errorText(e)))}
                  >
                    Revoke
                  </TextButton>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <InviteForm userId={userId} patientId={patientId} onCreated={(token) => void copyLink(token)} />
      <div className="mt-3">
        <ErrorNote message={error} />
      </div>
    </Panel>
  );
}

function MemberRow({ userId, member, onError }: { userId: string; member: Member; onError: (e: string | null) => void }) {
  const setPermissions = useMutation(api.settings.setPermissions);
  const revoke = useMutation(api.settings.revokeMember);
  const [busy, setBusy] = useState(false);

  async function save(permissions: Permission[], urgentAlerts: boolean) {
    setBusy(true);
    onError(null);
    try {
      await setPermissions({ userId, memberId: member._id, permissions, urgentAlerts });
    } catch (e: unknown) {
      onError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-plum/10 bg-white/70 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl leading-tight">
            {member.name}
            {member.isOwner && <span className="tag-pill ml-2 align-middle">Owner</span>}
          </p>
          <p className="text-sm text-plum-muted">
            {ROLES[member.role].title}
            {member.relationship ? ` · ${member.relationship}` : ""}
          </p>
        </div>
        {!member.isOwner && (
          <TextButton
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirm(`Remove ${member.name} from the care team? They'll stop getting updates right away.`)) {
                revoke({ userId, memberId: member._id }).catch((e: unknown) => onError(errorText(e)));
              }
            }}
          >
            Remove access
          </TextButton>
        )}
      </div>
      <fieldset className="mt-3 flex flex-wrap gap-2" disabled={busy}>
        <legend className="sr-only">What {member.name} gets</legend>
        {PERMISSIONS.map((p) => {
          const on = member.permissions.includes(p.id);
          return (
            <Chip
              key={p.id}
              on={on}
              label={p.label}
              onClick={() =>
                void save(on ? member.permissions.filter((x) => x !== p.id) : [...member.permissions, p.id], member.urgentAlerts)
              }
            />
          );
        })}
        <Chip on={member.urgentAlerts} label="Urgent alerts (falls, SOS)" onClick={() => void save(member.permissions, !member.urgentAlerts)} />
      </fieldset>
    </li>
  );
}

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm transition-colors ${
        on ? "border-violet bg-violet text-white" : "border-plum/20 bg-white text-plum hover:border-violet"
      }`}
    >
      {on ? "✓ " : ""}
      {label}
    </button>
  );
}

function InviteForm({ userId, patientId, onCreated }: { userId: string; patientId: Id<"patients">; onCreated: (token: string) => void }) {
  const create = useMutation(api.invites.create);
  const [name, setName] = useState("");
  const [role, setRole] = useState<CareRole>("care_partner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);

  return (
    <form
      className="mt-6 grid gap-3 rounded-2xl bg-lilac/70 p-4 sm:grid-cols-[1fr_220px_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        create({ userId, patientId, role, name })
          .then((token) => {
            setMade(name);
            setName("");
            onCreated(token);
          })
          .catch((err: unknown) => setError(errorText(err)))
          .finally(() => setBusy(false));
      }}
    >
      <label className="space-y-1">
        <span className="mono-label text-plum-muted">Invite someone</span>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" />
      </label>
      <label className="space-y-1">
        <span className="mono-label text-plum-muted">Role</span>
        <Select value={role} onChange={(e) => setRole(e.target.value as CareRole)}>
          {INVITABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLES[r].title}
            </option>
          ))}
        </Select>
      </label>
      <SecondaryButton type="submit" disabled={busy || !name.trim()}>
        {busy ? "Creating…" : "Create invite link"}
      </SecondaryButton>
      <p className="text-sm text-plum-muted sm:col-span-3">{ROLES[role].blurb}</p>
      {made && <p className="text-sm text-plum sm:col-span-3">Invite for {made} created; the link is copied. Send it to them yourself.</p>}
      <div className="sm:col-span-3">
        <ErrorNote message={error} />
      </div>
    </form>
  );
}
