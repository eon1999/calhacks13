"use client";

import Link from "next/link";
import { GlassButton } from "@/components/landing/glass-button";
import { StepHeading, TextButton } from "../ui";

interface DoneStepProps {
  patientName: string;
  recoveryLabel: string | null;
  medicationCount: number;
  paired: boolean;
  teamCount: number;
  onEdit: (step: "meds" | "band" | "team") => void;
}

export function DoneStep({ patientName, recoveryLabel, medicationCount, paired, teamCount, onEdit }: DoneStepProps) {
  const rows = [
    { label: "Recovery", value: recoveryLabel ?? "Not set", step: null },
    {
      label: "Medicines",
      value: medicationCount ? `${medicationCount} on the schedule` : "None yet",
      step: "meds" as const,
    },
    { label: "Band", value: paired ? "Paired" : "Not paired yet", step: "band" as const },
    { label: "Care team", value: teamCount > 1 ? `${teamCount} people (incl. invites)` : "Just you so far", step: "team" as const },
  ];

  return (
    <div>
      <StepHeading
        kicker="All set"
        sub={`Next: put the band on ${patientName}. It will say hello, explain who it keeps in the loop, and ask if that's okay.`}
      >
        <em>Cadence</em> is
        <br />
        ready for {patientName}
      </StepHeading>

      <dl className="max-w-2xl divide-y divide-plum/10 border-y border-plum/10">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 py-4">
            <dt className="mono-label text-plum-muted">{r.label}</dt>
            <dd className="flex items-baseline gap-3 text-right">
              <span className="font-display text-2xl">{r.value}</span>
              {r.step && (
                <TextButton type="button" onClick={() => onEdit(r.step)}>
                  Edit
                </TextButton>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-12 flex flex-wrap items-center gap-4">
        <GlassButton href="/hub?demo=1">Put the band on {patientName}</GlassButton>
        <Link href="/demo" className="mono-label text-plum-muted hover:text-violet">
          Back to the demo guide
        </Link>
      </div>
    </div>
  );
}
