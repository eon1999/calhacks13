import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { CareDashboard } from "@/components/care/care-dashboard";

export const metadata: Metadata = {
  title: "Care dashboard · Cadence",
  description: "Live alerts, doses, check-ins and movement for the person you care for.",
};

export default function CarePage() {
  return (
    <ConvexClientProvider>
      <CareDashboard />
    </ConvexClientProvider>
  );
}
