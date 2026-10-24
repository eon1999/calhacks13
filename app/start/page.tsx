import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { SetupWizard } from "@/components/onboarding/setup-wizard";

export const metadata: Metadata = {
  title: "Set up Cadence",
  description: "Set up a Cadence wristband for someone recovering at home after surgery.",
};

// Family-led onboarding: the person setting up owns the patient's profile.
export default function StartPage() {
  return (
    <ConvexClientProvider>
      <SetupWizard />
    </ConvexClientProvider>
  );
}
