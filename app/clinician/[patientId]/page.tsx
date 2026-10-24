import type { Metadata } from "next";
import { Suspense } from "react";
import { ClinicianReport } from "@/components/clinician/clinician-report";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import type { Id } from "@/convex/_generated/dataModel";

export const metadata: Metadata = {
  title: "Clinician report · Cadence",
  description: "Doses, pain, movement and events between visits, with observations that cite logged data.",
};

type Params = Promise<{ patientId: string }>;

async function ReportForPatient({ params }: { params: Params }) {
  const { patientId } = await params;
  return <ClinicianReport patientId={patientId as Id<"patients">} />;
}

// Printable observation report for the surgeon or clinician. `params` is read
// inside Suspense so the shell can prerender.
export default function ClinicianPage({ params }: { params: Params }) {
  return (
    <ConvexClientProvider>
      <Suspense fallback={null}>
        <ReportForPatient params={params} />
      </Suspense>
    </ConvexClientProvider>
  );
}
