"use client";

import { useQuery } from "convex/react";
import { AppShell, NoPatient, Panel } from "@/components/app/app-shell";
import { useNow } from "@/components/app/use-now";
import { useSelectedPatient } from "@/components/app/use-patient";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AlertList } from "./alert-list";
import { ActivityToday, AdherenceByDay } from "./care-charts";
import { DosesToday, Stat, Timeline } from "./day-panels";
import { SummaryCard } from "./summary-card";
import { useAlertNotifications } from "./use-alert-notifications";

const ROLE_LABEL: Record<string, string> = {
  care_partner: "Family",
  caregiver: "Caregiver",
  clinician: "Clinician",
};

/** /care: what the family member checks. Alerts first, then today, then the week. */
export function CareDashboard() {
  const { patients, patient, select, loading } = useSelectedPatient();
  const now = useNow(60_000);
  const patientId = patient?._id as Id<"patients"> | undefined;
  const data = useQuery(api.reports.care, patientId && now ? { patientId, now } : "skip");
  const alerts = useQuery(api.alerts.forCare, patientId ? { patientId } : "skip");
  const notifications = useAlertNotifications(alerts?.open, patient?.firstName);

  return (
    <AppShell patients={patients} patient={patient} onSelectPatient={select}>
      {!patient ? (
        <NoPatient loading={loading} />
      ) : !data || !alerts ? (
        <p className="text-plum-muted">Loading {patient.firstName}&apos;s day…</p>
      ) : (
        <div className="space-y-6">
          <header>
            <p className="mono-label text-plum-muted">Care dashboard</p>
            <h1 className="mt-2 font-display text-[clamp(2.6rem,7vw,4.5rem)] leading-none">
              How {data.patient.firstName} is <em>doing</em>
            </h1>
            <p className="mt-3 text-lg text-plum-muted">
              {data.patient.recovery
                ? `${data.patient.recovery.procedure} · ${data.patient.recovery.label}`
                : "No recovery details yet"}
              {" · "}
              {data.patient.consent === "agreed"
                ? "Agreed to share updates"
                : data.patient.consent === "declined"
                  ? "Hasn't agreed to share updates yet"
                  : "Consent not asked yet"}
            </p>
          </header>

          {notifications.permission === "default" && (
            <button
              type="button"
              onClick={() => void notifications.enable()}
              className="rounded-full border border-plum/20 bg-white px-4 py-2 text-sm font-medium hover:bg-lilac print:hidden"
            >
              Notify me on this device when something needs attention
            </button>
          )}

          <AlertList open={alerts.open} handled={alerts.handled} timeZone={data.patient.timeZone} />

          <div className="grid gap-6 lg:grid-cols-2">
            <DosesToday doses={data.doses} timeZone={data.patient.timeZone} />
            <Timeline entries={data.timeline} timeZone={data.patient.timeZone} />
          </div>

          <Panel title="Movement today">
            <ActivityToday activity={data.activity} timeZone={data.patient.timeZone} />
          </Panel>

          <Panel title="This week">
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                label="Doses taken"
                value={data.week.rate === null ? "–" : `${Math.round(data.week.rate)}%`}
                sub={`${data.week.onTime} on time · ${data.week.late} late · ${data.week.missed} missed`}
              />
              <Stat label="Average pain" value={data.week.painAverage === null ? "–" : `${data.week.painAverage}/10`} sub="from check-ins" />
              <Stat
                label="Steps a day"
                icon="steps"
                value={data.week.stepsPerDay === null ? "–" : data.week.stepsPerDay.toLocaleString("en-US")}
              />
              <Stat label="Days" value={String(data.week.days.length)} sub="in this view" />
            </div>
            <AdherenceByDay days={data.week.days} />
          </Panel>

          <SummaryCard patientId={data.patient._id} summary={data.summary} timeZone={data.patient.timeZone} />

          <Panel title="Care team">
            {data.team.length === 0 ? (
              <p className="text-plum-muted">Nobody else yet. Invite people from setup.</p>
            ) : (
              <ul className="flex flex-wrap gap-3">
                {data.team.map((m, i) => (
                  <li key={i} className="rounded-2xl border border-plum/10 bg-white px-4 py-3">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-sm text-plum-muted">
                      {ROLE_LABEL[m.role] ?? m.role}
                      {m.relationship ? ` · ${m.relationship}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </AppShell>
  );
}
