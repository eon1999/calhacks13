import Link from "next/link";
import { Suspense } from "react";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { WearableSimulator, type SimulatorMode } from "@/components/wearable/wearable-simulator";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Browser stand-in for the wristband until firmware/band is built. It calls the
// same /api/voice/* endpoints the device will use. Debug tools are on by
// default; ?demo=1 is the judge-facing view (no debug tools).
export default function HubPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="p-8">
      {/* searchParams is request data, so it's read inside Suspense (Next 16 prerendering). */}
      <Suspense fallback={null}>
        <Hub searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Hub({ searchParams }: { searchParams: SearchParams }) {
  const mode: SimulatorMode = (await searchParams).demo ? "demo" : "debug";
  return (
    <>
      <div className="mx-auto mb-6 flex max-w-5xl flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold">{mode === "demo" ? "Cadence band" : "Wearable simulator"}</h1>
        <nav className="flex gap-4 text-sm">
          {mode === "demo" ? (
            <>
              <Link href="/demo" className="text-muted-foreground underline-offset-4 hover:underline">
                Demo guide
              </Link>
              <Link href="/hub" className="text-muted-foreground underline-offset-4 hover:underline">
                Debug tools
              </Link>
            </>
          ) : (
            <Link href="/hub?demo=1" className="text-muted-foreground underline-offset-4 hover:underline">
              Demo view
            </Link>
          )}
        </nav>
      </div>
      <ConvexClientProvider>
        <WearableSimulator mode={mode} />
      </ConvexClientProvider>
    </>
  );
}
