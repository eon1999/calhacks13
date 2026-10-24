"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CareNav } from "@/components/care/care-nav";
import { DemoIdentityBanner, DemoIdentityPicker } from "@/components/notify/demo-identity-picker";
import { ErrorNote, errorText, OnboardingShell, StepHeading } from "@/components/onboarding/ui";
import { useDemoIdentity } from "@/components/onboarding/use-demo-identity";
import { formatLocalTime, type SlotStatus } from "@/lib/schedule";

const MINUTE = 60_000;

/** The current time, rounded to the minute so the Convex query args only change once a minute. */
export function useMinute(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / MINUTE) * MINUTE);
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / MINUTE) * MINUTE), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const SLOT_PILL: Record<SlotStatus, { label: string; className: string }> = {
  taken: { label: "Taken ✓", className: "bg-violet/10 text-violet" },
  due: { label: "Due now", className: "bg-amber-100 text-amber-900" },
  missed: { label: "Missed", className: "bg-rose-100 text-rose-800" },
  upcoming: { label: "Later", className: "bg-white/60 text-plum-muted" },
};

const STATE_TEXT = {
  doing_well: "Doing well",
  sore_but_managing: "Sore but managing",
  struggling: "Struggling",
  unsure: "Not sure",
} as const;

const TIER_TEXT = { urgent: "Urgent", notify: "Heads-up", ask: "Please check in" } as const;

/** /care: one calm page of today for family and caregivers. Doctors are sent to their report. */
export function CareToday() {
  const { identity } = useDemoIdentity();
  const router = useRouter();
  const teams = useQuery(api.care.myTeams, identity ? { userId: identity.id } : "skip");
  const [picked, setPicked] = useState<string | null>(null);
  const patientId = (picked ?? teams?.[0]?.patientId) as Id<"patients"> | undefined;
  const now = useMinute();
  const today = useQuery(
    api.care.today,
    identity && patientId ? { userId: identity.id, patientId, now } : "skip",
  );
  const markTaken = useMutation(api.care.markDoseTaken);
  const acknowledge = useMutation(api.care.acknowledgeAlert);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const redirect = today?.redirect;
  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  async function act(key: string, task: () => Promise<unknown>) {
    setPending(key);
    setError(null);
    try {
      await task();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setPending(null);
    }
  }

  const loading = teams === undefined || (patientId && today === undefined);
  const data = today && !today.redirect ? today : null;
  const tz = data?.patient.timeZone ?? "UTC";
  const time = (at: number) => formatLocalTime(tz, at);
  const flagged = data?.checkIns.filter((c) => c.needsLook) ?? [];

  return (
    <OnboardingShell label="Care" aside={<CareNav current="care" />}>
      <DemoIdentityBanner name={data?.me.name} />
      {loading && <p className="text-plum-muted">Loading…</p>}
      {teams?.length === 0 && (
        <>
          <StepHeading kicker="Today">Nobody to look after <em>yet</em></StepHeading>
          <DemoIdentityPicker />
        </>
      )}

      {teams && teams.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Who you're looking after">
          {teams.map((t) => (
            <button
              key={t.patientId}
              type="button"
              role="tab"
              aria-selected={t.patientId === patientId}
              onClick={() => setPicked(t.patientId)}
              className={`glass-pill h-9 px-4 text-sm ${t.patientId === patientId ? "text-violet" : "text-plum-muted"}`}
            >
              {t.patientName}
            </button>
          ))}
        </div>
      )}

      {data && (
        <>
          <StepHeading kicker={data.recovery?.label ?? "Today"} sub={data.recovery?.focus}>
            <em>Today</em> with {data.patient.name}
          </StepHeading>
          <ErrorNote message={error} />

          <section aria-labelledby="look" className="mt-8 space-y-3">
            <h2 id="look" className="mono-label text-plum-muted">
              Needs a look
            </h2>
            {data.alerts.length === 0 && flagged.length === 0 ? (
              <p className="rounded-2xl border border-plum/10 bg-white/40 px-4 py-3">Nothing needs a look right now.</p>
            ) : (
              <ul className="space-y-2">
                {data.alerts.map((a) => (
                  <li
                    key={a.id}
                    className={`flex flex-wrap items-start justify-between gap-3 rounded-2xl border px-4 py-3 ${
                      a.tier === "urgent" ? "border-rose-300 bg-rose-50/90" : "border-amber-300 bg-amber-50/80"
                    }`}
                  >
                    <span>
                      <span className="mono-label mr-2">{TIER_TEXT[a.tier as keyof typeof TIER_TEXT] ?? a.tier}</span>
                      <span className="text-plum-muted">{time(a.createdAt)}</span>
                      <span className="mt-1 block">{a.reason}</span>
                    </span>
                    <button
                      type="button"
                      disabled={pending === a.id}
                      onClick={() => void act(a.id, () => acknowledge({ userId: identity!.id, alertId: a.id }))}
                      className="glass-pill h-9 shrink-0 px-4 text-sm font-medium text-plum disabled:opacity-50"
                    >
                      I&apos;ve got it
                    </button>
                  </li>
                ))}
                {flagged.map((c) => (
                  <li key={c.id} className="rounded-2xl border border-amber-300 bg-amber-50/80 px-4 py-3">
                    <span className="mono-label mr-2">Check-in</span>
                    <span className="text-plum-muted">{time(c.at)}</span>
                    <span className="mt-1 block">
                      {STATE_TEXT[c.state]}
                      {c.painScore !== undefined && `, pain ${c.painScore}/10`}
                      {c.notes && `: ${c.notes}`}
                      {c.redFlag && " (warning sign)"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="meds" className="mt-10 space-y-3">
            <h2 id="meds" className="mono-label text-plum-muted">
              Medicines · {data.slots.filter((s) => s.status === "taken").length}/{data.slots.length} taken
            </h2>
            {data.slots.length === 0 ? (
              <p className="text-plum-muted">No medicines on the schedule.</p>
            ) : (
              <ul className="divide-y divide-plum/10 rounded-2xl border border-plum/10 bg-white/40">
                {data.slots.map((s) => (
                  <li key={s.slotId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="w-14 font-mono text-sm">{s.time}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{s.name}</span>{" "}
                      <span className="text-sm text-plum-muted">{s.doseLabel}</span>
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${SLOT_PILL[s.status].className}`}>
                      {SLOT_PILL[s.status].label}
                    </span>
                    {(s.status === "due" || s.status === "missed") && (
                      <button
                        type="button"
                        disabled={pending === s.slotId}
                        onClick={() =>
                          void act(s.slotId, () =>
                            markTaken({
                              userId: identity!.id,
                              medicationId: s.medicationId as Id<"medications">,
                              scheduledFor: s.scheduledFor,
                            }),
                          )
                        }
                        className="glass-pill h-9 px-4 text-sm font-medium text-plum disabled:opacity-50"
                      >
                        Mark taken
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="checkins" className="mt-10 space-y-3">
            <h2 id="checkins" className="mono-label text-plum-muted">
              Check-ins today
            </h2>
            {data.checkIns.length === 0 ? (
              <p className="text-plum-muted">No check-ins yet today. The band asks on its own through the day.</p>
            ) : (
              <ul className="space-y-2">
                {data.checkIns.map((c) => (
                  <li
                    key={c.id}
                    className={`rounded-2xl border px-4 py-3 ${c.needsLook ? "border-amber-300 bg-amber-50/70" : "border-plum/10 bg-white/40"}`}
                  >
                    <span className="font-mono text-sm text-plum-muted">{time(c.at)}</span>{" "}
                    <span className="font-medium">{STATE_TEXT[c.state]}</span>
                    {c.painScore !== undefined && <span className="text-plum-muted"> · pain {c.painScore}/10</span>}
                    {c.notes && <span className="mt-1 block text-sm">{c.notes}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(data.patient.careNotes || data.steps > 0) && (
            <section className="mt-10 space-y-2 border-t border-plum/10 pt-6 text-sm text-plum-muted">
              {data.steps > 0 && <p>{data.steps.toLocaleString()} steps today.</p>}
              {data.patient.careNotes && (
                <p>
                  <span className="mono-label mr-2">Care notes</span>
                  {data.patient.careNotes}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </OnboardingShell>
  );
}
