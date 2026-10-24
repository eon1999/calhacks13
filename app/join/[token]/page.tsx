import type { Metadata } from "next";
import { Suspense } from "react";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { JoinFlow } from "@/components/onboarding/join-flow";

export const metadata: Metadata = {
  title: "Join a care team · Cadence",
  robots: { index: false },
};

type Params = Promise<{ token: string }>;

async function JoinWithToken({ params }: { params: Params }) {
  const { token } = await params;
  return <JoinFlow token={token} />;
}

// Invite landing page. `params` is read inside Suspense so the shell can prerender.
export default function JoinPage({ params }: { params: Params }) {
  return (
    <ConvexClientProvider>
      <Suspense fallback={null}>
        <JoinWithToken params={params} />
      </Suspense>
    </ConvexClientProvider>
  );
}
