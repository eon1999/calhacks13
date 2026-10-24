"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { createAnimatable } from "animejs";
import { SURFACES, type Surface } from "./content";
import { GlassButton } from "./glass-button";
import { useReveal } from "./use-reveal";

/** A card that tilts toward the pointer and carries a light spot under it. */
function SurfaceCard({ surface, index }: { surface: Surface; index: number }) {
  const card = useRef<HTMLAnchorElement>(null);
  const art = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = card.current;
    const visual = art.current;
    if (!el || !visual || !window.matchMedia("(pointer: fine)").matches) return;

    const tilt = createAnimatable(visual, { rotateX: 500, rotateY: 500, scale: 500, ease: "out(3)" });
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top) / r.height;
      tilt.rotateY((nx - 0.5) * 10);
      tilt.rotateX((0.5 - ny) * 10);
      tilt.scale(1.02);
      visual.style.setProperty("--mx", `${nx * 100}%`);
      visual.style.setProperty("--my", `${ny * 100}%`);
    };
    const onLeave = () => {
      tilt.rotateX(0);
      tilt.rotateY(0);
      tilt.scale(1);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      tilt.revert();
    };
  }, []);

  const [a, b] = surface.hue;
  return (
    <Link ref={card} href={surface.href} data-fade className="group block [perspective:900px]">
      <div
        ref={art}
        className="relative aspect-[4/3] overflow-hidden rounded-2xl"
        style={{
          background: `radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgb(255 255 255 / 0.45), transparent 45%), linear-gradient(135deg, ${a}, ${b})`,
        }}
      >
        <span className="absolute inset-0 grid place-items-center font-display text-[9rem] leading-none text-white/80 transition-transform duration-700 group-hover:scale-110 group-hover:rotate-6">
          {surface.glyph}
        </span>
        <span className="mono-label absolute left-4 top-4 text-white/80">
          ({String(index + 1).padStart(3, "0")})
        </span>
      </div>
      <p className="mono-label mt-3 text-plum-muted">{surface.tags.join(" / ")}</p>
      <p className="mt-1 font-display text-2xl text-plum transition-colors group-hover:text-violet">
        {surface.title}
      </p>
    </Link>
  );
}

/** "Some / of the / surfaces": the app's own screens, presented like a project grid. */
export function Surfaces() {
  const root = useReveal<HTMLElement>({ when: "scroll" });

  return (
    <section ref={root} className="invisible bg-lilac px-5 py-28 text-plum md:px-10 md:py-40">
      <div data-split className="display grid grid-cols-2 text-[clamp(3rem,8vw,8rem)]">
        <span>Some</span>
        <em className="justify-self-end pr-[8%]">of the</em>
        <span className="col-span-2 pl-[18%]">surfaces</span>
      </div>
      <p data-fade className="mono-label mt-6 max-w-[40ch]">
        One wristband, and a window in for everyone who cares: the family first, then the person wearing it and the team
        who treats them.
      </p>

      <div className="mt-16 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
        {SURFACES.map((s, i) => (
          <SurfaceCard key={s.href} surface={s} index={i} />
        ))}
      </div>

      <div data-fade className="mt-16 flex justify-center">
        <GlassButton href="/hub">Open the simulator</GlassButton>
      </div>
    </section>
  );
}
