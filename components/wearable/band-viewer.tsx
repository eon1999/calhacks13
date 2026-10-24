"use client";

import dynamic from "next/dynamic";

// WebGL only exists in the browser, so skip prerendering the canvas.
const BandModel = dynamic(() => import("./band-model"), {
  ssr: false,
  loading: () => <div className="mono-label grid h-full place-items-center text-white/70">Loading band…</div>,
});

export function BandViewer() {
  return (
    <div className="relative h-[52svh] min-h-[320px] w-full cursor-grab active:cursor-grabbing md:h-[70svh] [&_canvas]:touch-pan-y!">
      <BandModel />
      <p className="mono-label pointer-events-none absolute inset-x-0 bottom-2 text-center text-white/70">
        Drag to spin
      </p>
    </div>
  );
}
