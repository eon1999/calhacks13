"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";

let shared: ConvexReactClient | null = null;

/**
 * Live Convex queries for client pages (onboarding, pairing). Scoped to the
 * routes that need it so the landing page doesn't open a websocket.
 * The client is created after mount: its constructor uses Math.random(), which
 * Next.js refuses during prerender.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const [client, setClient] = useState<ConvexReactClient | null>(null);

  useEffect(() => {
    if (!url) return;
    shared ??= new ConvexReactClient(url);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only client
    setClient(shared);
  }, [url]);

  if (!url) {
    return (
      <p className="p-8 text-sm text-destructive">
        NEXT_PUBLIC_CONVEX_URL is not set. Run <code>npx convex dev</code> or add it to the Vercel project.
      </p>
    );
  }
  if (!client) return null;
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
