import { Suspense } from "react";
import { AuthControls } from "@/components/auth/auth-controls";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { Sky } from "@/components/landing/sky";
import { HubDemo } from "@/components/wearable/hub-demo";
import type { SimulatorMode } from "@/components/wearable/wearable-simulator";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Browser stand-in for the wristband until firmware/band is built. It calls the
// same /api/voice/* endpoints the device will use. Debug tools are on by
// default; ?demo=1 is the judge-facing view (no debug tools).
export default function HubPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="relative min-h-svh bg-[#4a12a3]">
      {/* Same dusk backdrop as the landing hero, pinned behind the page. */}
      <div className="fixed inset-0">
        <Sky />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#2a0f5c]/70 via-[#2a0f5c]/25 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-5 py-10 md:px-10">
        <div className="mb-4 flex justify-end">
          <AuthControls tone="dark" />
        </div>
        {/* searchParams is request data, so it's read inside Suspense (Next 16 prerendering). */}
        <Suspense fallback={null}>
          <Hub searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Hub({ searchParams }: { searchParams: SearchParams }) {
  const mode: SimulatorMode = (await searchParams).demo ? "demo" : "debug";
  return (
    <ConvexClientProvider>
      <HubDemo mode={mode} />
    </ConvexClientProvider>
  );
}
