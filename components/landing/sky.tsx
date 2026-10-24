"use client";

import { useEffect, useMemo, useRef } from "react";
import { animate, createAnimatable, stagger } from "animejs";

const W = 1440;

// Deterministic pseudo-random so server and client markup match.
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Round path numbers so server and client strings match exactly (float noise
// otherwise causes a hydration mismatch).
function tidy(d: string): string {
  return d.replace(/-?\d+\.\d+/g, (n) => Number(n).toFixed(1));
}

/** A row of low standing stones whose bases sit on y = base. */
function rocksPath(seed: number, base: number, maxH: number, count: number): string {
  return tidy(rawRocks(seed, base, maxH, count));
}

function rawRocks(seed: number, base: number, maxH: number, count: number): string {
  let d = "";
  for (let i = 0; i < count; i++) {
    const x = (i / count) * W + rand(seed + i) * 40 - 20;
    const w = 30 + rand(seed + i * 3) * 70;
    const h = maxH * (0.35 + rand(seed + i * 7) * 0.65);
    const lean = (rand(seed + i * 11) - 0.5) * w * 0.5;
    d += `M${x},${base} L${x + w * 0.12},${base - h * 0.85} L${x + w * 0.45 + lean},${base - h} `;
    d += `L${x + w * 0.88},${base - h * 0.78} L${x + w},${base} Z `;
  }
  return d;
}

/** Jagged grass blades across the bottom edge. */
function grassPath(seed: number, top: number, bottom: number): string {
  let d = `M0,${bottom} L0,${top + 20} `;
  for (let x = 0; x <= W; x += 9) {
    const h = 10 + rand(seed + x) * 48;
    d += `L${x + 4},${top + 24 - h} L${x + 9},${top + 22} `;
  }
  return tidy(d + `L${W},${bottom} Z`);
}

/**
 * Painted dusk backdrop: lavender sky, drifting pink clouds, standing stones,
 * a still lake that mirrors them, and a grass bank. Layers parallax with the
 * pointer (anime.js animatables) so the scene feels deep without WebGL.
 */
export function Sky() {
  const root = useRef<HTMLDivElement>(null);
  const paths = useMemo(
    () => ({
      far: rocksPath(1, 200, 70, 34),
      near: rocksPath(7, 200, 120, 18),
      grass: grassPath(3, 40, 160),
      grassBack: grassPath(9, 60, 160),
    }),
    [],
  );

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const layers = [...el.querySelectorAll<HTMLElement>("[data-depth]")].map((node) => ({
      depth: Number(node.dataset.depth),
      anim: createAnimatable(node, { x: 1400, y: 1400, ease: "out(3)" }),
    }));

    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      for (const { depth, anim } of layers) {
        anim.x(-nx * depth);
        anim.y(-ny * depth * 0.35);
      }
    };

    const drift = reduced
      ? null
      : animate(el.querySelectorAll("[data-cloud]"), {
          x: ["-4vw", "4vw"],
          scale: [1, 1.08],
          duration: stagger(4000, { start: 16000 }),
          ease: "inOutSine",
          loop: true,
          alternate: true,
        });

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      drift?.revert();
      layers.forEach(({ anim }) => anim.revert());
    };
  }, []);

  return (
    <div ref={root} aria-hidden className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #ac93e6 0%, #bba3ee 30%, #d3bdf3 52%, #ecd2f3 61%, #c4abee 64%, #b49ae8 74%, #7a3fd6 80%, #4a12a3 100%)",
        }}
      />

      {/* clouds */}
      <div data-depth="12" className="absolute inset-0">
        <div data-cloud className="absolute -left-[8%] top-[4%] h-[34vh] w-[48vw] rounded-full bg-[#f3c6ef]/60 blur-[60px]" />
        <div data-cloud className="absolute right-[-6%] top-[10%] h-[28vh] w-[40vw] rounded-full bg-[#f6d3f3]/55 blur-[70px]" />
        <div data-cloud className="absolute left-[30%] top-[-6%] h-[24vh] w-[36vw] rounded-full bg-[#e9c2f6]/45 blur-[60px]" />
      </div>

      {/* far + near stones on the horizon, plus their reflection */}
      <div data-depth="18" className="absolute inset-x-[-4%] top-[44%] h-[20%]">
        <svg viewBox={`0 0 ${W} 200`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d={paths.far} fill="#8a76b8" opacity="0.75" />
        </svg>
      </div>
      <div data-depth="30" className="absolute inset-x-[-4%] top-[42%] h-[22%]">
        <svg viewBox={`0 0 ${W} 200`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d={paths.near} fill="#5c4a8c" opacity="0.9" />
        </svg>
        <svg
          viewBox={`0 0 ${W} 200`}
          preserveAspectRatio="none"
          className="absolute inset-x-0 top-full h-[60%] w-full -scale-y-100 opacity-25 blur-[1px]"
        >
          <path d={paths.near} fill="#5c4a8c" />
        </svg>
      </div>

      {/* lake sheen */}
      <div className="absolute inset-x-0 top-[64%] h-[14%] bg-gradient-to-b from-white/25 to-transparent" />

      {/* grass bank */}
      <div data-depth="46" className="absolute inset-x-[-4%] bottom-[-2%] h-[26%]">
        <svg viewBox={`0 0 ${W} 160`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d={paths.grassBack} fill="#6a22d4" opacity="0.8" />
          <path d={paths.grass} fill="#4c0fb0" />
        </svg>
      </div>
    </div>
  );
}
