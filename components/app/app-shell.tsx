"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AuthControls } from "@/components/auth/auth-controls";
import { Wordmark } from "@/components/landing/wordmark";
import type { Id } from "@/convex/_generated/dataModel";
import type { PatientSummary } from "./use-patient";

const NAV = [
  { href: "/hub", label: "Hub", who: "Patient" },
  { href: "/care", label: "Care", who: "Family" },
  { href: "/clinician", label: "Report", who: "Clinician" },
  { href: "/settings", label: "Settings", who: "Care team" },
  { href: "/demo", label: "Demo", who: "Team" },
];

/**
 * Frame for the care team's pages: wordmark, page nav, patient picker, and a
 * "simulated data" label whenever the patient is the seeded demo.
 */
export function AppShell({
  children,
  patients,
  patient,
  onSelectPatient,
}: {
  children: ReactNode;
  patients?: PatientSummary[];
  patient?: PatientSummary | null;
  onSelectPatient?: (id: Id<"patients">) => void;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-svh bg-lilac text-plum print:bg-white">
      <header className="border-b border-plum/10 bg-white/50 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 md:px-8">
          <Link href="/" aria-label="Cadence home" className="text-3xl">
            <Wordmark />
          </Link>
          <nav aria-label="Pages" className="flex flex-wrap gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href === "/clinician" && patient ? `/clinician/${patient._id}` : item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-plum text-white" : "text-plum hover:bg-white/80"
                  }`}
                >
                  {item.label}
                  <span className="sr-only"> ({item.who})</span>
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {patients && patients.length > 1 && onSelectPatient && (
              <label className="flex items-center gap-2 text-sm">
                <span className="mono-label text-plum-muted">Patient</span>
                <select
                  className="h-10 rounded-full border border-plum/15 bg-white px-3 text-sm"
                  value={patient?._id ?? ""}
                  onChange={(e) => onSelectPatient(e.target.value as Id<"patients">)}
                >
                  {patients.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                      {p.isDemo ? " (demo)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <AuthControls />
          </div>
        </div>
      </header>
      {patient?.isDemo && <SimulatedBanner />}
      <main className="mx-auto max-w-6xl px-5 py-8 md:px-8 print:max-w-none print:px-0 print:py-0">{children}</main>
    </div>
  );
}

export function SimulatedBanner() {
  return (
    <div role="note" className="border-b border-amber-300/60 bg-amber-50 px-5 py-2 text-center text-sm text-amber-900 print:border print:border-amber-400">
      <strong>Simulated data.</strong> This patient and their history are generated for the demo. No real patient data is
      shown.
    </div>
  );
}

/** Shown while there is no patient to show yet. */
export function NoPatient({ loading }: { loading: boolean }) {
  if (loading) return <p className="text-plum-muted">Loading…</p>;
  return (
    <div className="rounded-3xl border border-plum/10 bg-white/70 p-8">
      <h1 className="font-display text-4xl">No patient yet</h1>
      <p className="mt-3 max-w-prose text-plum-muted">
        Set one up on <Link className="text-violet underline" href="/start">/start</Link>, or load the simulated demo patient
        from <Link className="text-violet underline" href="/demo">/demo</Link>.
      </p>
    </div>
  );
}

/** A white card section with a mono label heading. */
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-plum/10 bg-white/80 p-5 shadow-[0_10px_40px_-24px_rgb(66_18_140/0.35)] md:p-6 print:break-inside-avoid print:rounded-none print:border-0 print:p-0 print:shadow-none ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="mono-label text-plum-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
