import type { Metadata } from "next";
import { CareToday } from "@/components/care/care-today";
import { ConvexClientProvider } from "@/components/convex-client-provider";

export const metadata: Metadata = {
  title: "Today · Cadence",
  robots: { index: false },
};

// Family and caregivers land here after joining (components/onboarding/join-flow.tsx).
export default function CarePage() {
  return (
    <ConvexClientProvider>
      <CareToday />
    </ConvexClientProvider>
  );
}
