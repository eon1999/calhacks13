import Link from "next/link";
import { Suspense } from "react";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { OnboardingShell } from "@/components/onboarding/ui";
import { WearableSimulator, type SimulatorMode } from "@/components/wearable/wearable-simulator";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Browser stand-in for the wristband until firmware/band is built. It calls the
// same /api/voice/* endpoints the device will use. Debug tools are on by
// default; ?demo=1 is the judge-facing view (no debug tools).
export default function HubPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    // searchParams is request data, so it's read inside Suspense (Next 16 prerendering).
    <Suspense fallback={<OnboardingShell label="Band" wide>{null}</OnboardingShell>}>
      <Hub searchParams={searchParams} />
    </Suspense>
  );
}

const navLink = "mono-label rounded-full px-3 py-2 text-plum-muted transition-colors hover:text-violet";

async function Hub({ searchParams }: { searchParams: SearchParams }) {
  const mode: SimulatorMode = (await searchParams).demo ? "demo" : "debug";
  return (
    <OnboardingShell label={mode === "demo" ? "Band" : "Simulator"} wide>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="tag-pill">▸ {mode === "demo" ? "Demo" : "Debug tools on"}</span>
          <h1 className="display mt-5 text-[clamp(2.4rem,5vw,4.25rem)]">
            {mode === "demo" ? (
              <>
                <em>The</em> Cadence band
              </>
            ) : (
              <>
                <em>Wearable</em> simulator
              </>
            )}
          </h1>
          <p className="mt-4 max-w-[52ch] text-base text-plum-muted">
            {mode === "demo"
              ? "Talk to it like the person wearing it would. When something sounds wrong, the family gets a text."
              : "A browser stand-in for the wristband. It calls the same endpoints the firmware will."}
          </p>
        </div>
        <nav className="flex gap-1">
          {mode === "demo" ? (
            <>
              <Link href="/demo" className={navLink}>
                ← Demo guide
              </Link>
              <Link href="/hub" className={navLink}>
                Debug tools
              </Link>
            </>
          ) : (
            <Link href="/hub?demo=1" className={navLink}>
              Demo view →
            </Link>
          )}
        </nav>
      </div>
      <div className="cadence-theme">
        <ConvexClientProvider>
          <WearableSimulator mode={mode} />
        </ConvexClientProvider>
      </div>
    </OnboardingShell>
  );
}
