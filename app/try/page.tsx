import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { DemoGuide } from "@/components/demo/demo-guide";

export const metadata: Metadata = {
  title: "Try Cadence",
  description: "Set Cadence up for someone, pair the band, and get your first alert text.",
};

// The judge's entry point: a live checklist over /start and the band (/hub?demo=1).
// (/demo is the team's device-event control panel.)
export default function TryPage() {
  return (
    <ConvexClientProvider>
      <DemoGuide />
    </ConvexClientProvider>
  );
}
