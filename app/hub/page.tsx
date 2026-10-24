import { ConvexClientProvider } from "@/components/convex-client-provider";
import { Sky } from "@/components/landing/sky";
import { HubDemo } from "@/components/wearable/hub-demo";

// Browser stand-in for the wristband until firmware/band is built. It calls the
// same /api/voice/* endpoints the device will use.
export default function HubPage() {
  return (
    <main className="relative min-h-svh bg-[#4a12a3]">
      {/* Same dusk backdrop as the landing hero, pinned behind the page. */}
      <div className="fixed inset-0">
        <Sky />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#2a0f5c]/70 via-[#2a0f5c]/25 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-5 py-10 md:px-10">
        <ConvexClientProvider>
          <HubDemo />
        </ConvexClientProvider>
      </div>
    </main>
  );
}
