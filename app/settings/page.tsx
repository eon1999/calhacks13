import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { SettingsPage } from "@/components/settings/settings-page";

export const metadata: Metadata = {
  title: "Settings · Cadence",
  description: "Medicines and schedule, care team and permissions, devices and tokens.",
};

export default function Page() {
  return (
    <ConvexClientProvider>
      <SettingsPage />
    </ConvexClientProvider>
  );
}
