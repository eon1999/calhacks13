import type { Metadata } from "next";
import { Suspense } from "react";
import { ClinicianReport } from "@/components/care/clinician-report";
import { ConvexClientProvider } from "@/components/convex-client-provider";

export const metadata: Metadata = {
  title: "Recovery report · Cadence",
  robots: { index: false },
};

async function ReportForPatient({ params }: { params: PageProps<"/clinician/[patientId]">["params"] }) {
  const { patientId } = await params;
  return <ClinicianReport patientId={patientId} />;
}

// Read-only report for the doctor. `params` is read inside Suspense so the shell can prerender.
export default function ClinicianPage(props: PageProps<"/clinician/[patientId]">) {
  return (
    <ConvexClientProvider>
      <Suspense fallback={null}>
        <ReportForPatient params={props.params} />
      </Suspense>
    </ConvexClientProvider>
  );
}
