"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell, NoPatient } from "@/components/app/app-shell";
import { useSelectedPatient } from "@/components/app/use-patient";
import { ConvexClientProvider } from "@/components/convex-client-provider";

function PickPatient() {
  const router = useRouter();
  const { patients, patient, select, loading } = useSelectedPatient();
  useEffect(() => {
    if (patient) router.replace(`/clinician/${patient._id}`);
  }, [patient, router]);
  return (
    <AppShell patients={patients} patient={patient} onSelectPatient={select}>
      {patient ? <p className="text-plum-muted">Opening {patient.firstName}&apos;s report…</p> : <NoPatient loading={loading} />}
    </AppShell>
  );
}

export default function ClinicianIndexPage() {
  return (
    <ConvexClientProvider>
      <PickPatient />
    </ConvexClientProvider>
  );
}
