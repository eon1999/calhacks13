import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { DemoPanel } from "@/components/demo/demo-panel";

export const metadata: Metadata = {
  title: "Demo controls · Cadence",
  description: "Team-only panel that simulates every device event, so the demo works with the hardware unplugged.",
};

// Team only. TODO(auth): hide behind a team login before any real deployment.
export default function Page() {
  return (
    <ConvexClientProvider>
      <DemoPanel />
    </ConvexClientProvider>
  );
}
