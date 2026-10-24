"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { AppShell, NoPatient, Panel } from "@/components/app/app-shell";
import { useSelectedPatient } from "@/components/app/use-patient";
import { useDemoIdentity } from "@/components/onboarding/use-demo-identity";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { procedureLabel, type ProcedureId } from "@/lib/onboarding/recovery";
import { CareTeamPanel } from "./care-team-panel";
import { DevicesPanel } from "./devices-panel";
import { MedicationsPanel } from "./medications-panel";

/** /settings: medicines, care team and permissions, devices. */
export function SettingsPage() {
  const { patients, patient, select, loading } = useSelectedPatient();
  return (
    <AppShell patients={patients} patient={patient} onSelectPatient={select}>
      {patient ? <Settings patientId={patient._id} /> : <NoPatient loading={loading} />}
    </AppShell>
  );
}

function Settings({ patientId }: { patientId: Id<"patients"> }) {
  const overview = useQuery(api.settings.overview, { patientId });
  const { identity } = useDemoIdentity();
  // TODO(auth): demo-only. With no sign-in, this browser's demo identity is
  // usually not on the team, so the page can act as the patient's owner.
  const [asOwner, setAsOwner] = useState(true);

  if (overview === undefined || !identity) return <p className="text-plum-muted">Loading…</p>;
  if (overview === null) return <p className="text-plum-muted">Patient not found.</p>;

  const userId = asOwner && overview.ownerUserId ? overview.ownerUserId : identity.id;
  const me = overview.members.find((m) => m.userId === userId);
  const canManage = !!me && (me.isOwner || me.role === "patient");
  const p = overview.patient;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono-label text-plum-muted">Settings</p>
          <h1 className="font-display text-5xl leading-tight">{p.preferredName ?? p.name}&apos;s care setup</h1>
        </div>
        <label className="flex max-w-sm items-start gap-3 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-violet"
            checked={asOwner}
            onChange={(e) => setAsOwner(e.target.checked)}
          />
          <span>
            <strong>Demo only: manage as the owner.</strong> There&apos;s no sign-in yet, so changes are made as the person who set
            Cadence up{overview.members.find((m) => m.isOwner) ? ` (${overview.members.find((m) => m.isOwner)!.name})` : ""}.
          </span>
        </label>
      </div>

      {!canManage && (
        <p role="note" className="rounded-2xl border border-plum/10 bg-white/70 px-4 py-3 text-sm text-plum-muted">
          You&apos;re viewing as someone who isn&apos;t the owner or the patient, so changes will be refused. Only they can change the
          schedule, the care team or devices.
        </p>
      )}

      <Panel title="Profile" action={<Link href="/start" className="text-sm text-violet underline">Edit full profile in setup</Link>}>
        <dl className="grid gap-x-8 gap-y-3 text-base sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Name" value={`${p.name}${p.preferredName ? ` (“${p.preferredName}”)` : ""}`} />
          <Item label="Time zone" value={p.timeZone} />
          <Item label="Language" value={p.language ?? "English"} />
          {p.recovery && (
            <>
              <Item label="Procedure" value={procedureLabel(p.recovery.procedure as ProcedureId, p.recovery.procedureOther)} />
              <Item label="Surgery date" value={p.recovery.surgeryDate} />
              {p.recovery.careNotes && <Item label="Care notes" value={p.recovery.careNotes} />}
            </>
          )}
          {p.health && (
            <>
              <Item label="Other conditions" value={p.health.conditions.join(", ") || "None listed"} />
              <Item
                label="Allergies"
                value={p.health.noKnownAllergies ? "No known allergies" : p.health.allergies.join(", ") || "None listed"}
              />
            </>
          )}
          <Item
            label="Emergency contacts"
            value={p.emergencyContacts.map((c) => `${c.name} ${c.phone}`).join(" · ") || "None yet"}
          />
          <Item
            label="Band consent"
            value={p.consent ? (p.consent.status === "agreed" ? "Agreed to share updates" : "Not yet agreed") : "Not asked yet"}
          />
        </dl>
      </Panel>

      <MedicationsPanel userId={userId} patientId={patientId} medications={overview.medications} />
      <CareTeamPanel
        userId={userId}
        patientId={patientId}
        members={overview.members}
        invites={overview.pendingInvites}
      />
      <DevicesPanel userId={userId} patientId={patientId} />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="mono-label text-plum-muted">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
