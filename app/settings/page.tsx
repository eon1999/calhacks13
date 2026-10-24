import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { MyNotifications } from "@/components/notify/my-notifications";

export const metadata: Metadata = {
  title: "My notifications · Cadence",
  robots: { index: false },
};

// Caregivers and family reach their notification settings here without the hub.
export default function SettingsPage() {
  return (
    <ConvexClientProvider>
      <MyNotifications />
    </ConvexClientProvider>
  );
}
