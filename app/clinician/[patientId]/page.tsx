"use client";

import { use } from "react";
import { ClinicianReport } from "@/components/clinician/clinician-report";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import type { Id } from "@/convex/_generated/dataModel";

// Printable observation report for the surgeon or clinician.
export default function ClinicianPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = use(params);
  return (
    <ConvexClientProvider>
      <ClinicianReport patientId={patientId as Id<"patients">} />
    </ConvexClientProvider>
  );
}
