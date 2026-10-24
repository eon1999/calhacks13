"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "animejs";
import { FEATURES } from "./content";
import { GlassButton } from "./glass-button";
import { useReveal } from "./use-reveal";

const ROW = 56;

/**
 * "What it does": a pinned section whose right column is a scroll-driven wheel
 * of capabilities. The row at the centre is lit and marked with →; hovering
 * a row also selects it.
 */
export function FeatureWheel() {
  const section = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const copy = useReveal<HTMLDivElement>({ when: "scroll" });
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    // Progress through the pinned range: 0 when the section top hits the
    // viewport top, 1 when its bottom hits the viewport bottom.
    const onScrollPos = () => {
      const r = el.getBoundingClientRect();
      const range = r.height - window.innerHeight;
      const p = range > 0 ? Math.min(1, Math.max(0, -r.top / range)) : 0;
      setActive(Math.round(p * (FEATURES.length - 1)));
    };
    onScrollPos();
    window.addEventListener("scroll", onScrollPos, { passive: true });
    return () => window.removeEventListener("scroll", onScrollPos);
  }, []);

  useEffect(() => {
    if (!list.current || !viewport.current) return;
    const centre = viewport.current.clientHeight / 2 - ROW / 2;
    const a = animate(list.current, { y: centre - active * ROW, duration: 750, ease: "out(4)" });
    return () => {
      a.pause();
    };
  }, [active]);

  return (
    <section ref={section} className="relative h-[240vh] bg-lilac text-plum">
      <div className="sticky top-0 grid h-[100svh] grid-rows-[auto_1fr] gap-8 px-5 pb-24 pt-16 md:grid-cols-2 md:grid-rows-1 md:items-center md:gap-16 md:px-10 md:py-0">
        <div ref={copy} className="invisible">
          <span data-fade className="tag-pill">
            What it does
          </span>
          <p
            data-split
            className="mt-6 max-w-[22ch] font-display text-[clamp(1.9rem,3.4vw,3.2rem)] leading-[1.02] tracking-tight"
          >
            Cadence lives on their wrist and on your phone. It looks after them through the day and keeps the whole
            family on the same page, without anyone having to hover.
          </p>
          <div data-fade className="mt-8">
            <GlassButton href="/hub">Try the simulator</GlassButton>
          </div>
        </div>

        <div
          ref={viewport}
          className="relative h-full max-h-[460px] overflow-hidden md:h-[460px]"
          style={{ maskImage: "linear-gradient(transparent, #000 30%, #000 70%, transparent)" }}
        >
          <ul ref={list} className="absolute inset-x-0 top-0">
            {FEATURES.map((f, i) => {
              const d = Math.abs(i - active);
              return (
                <li
                  key={f}
                  onPointerEnter={() => setActive(i)}
                  style={{ height: ROW, opacity: d === 0 ? 1 : Math.max(0.12, 0.55 - d * 0.14) }}
                  className="flex cursor-default items-center justify-between border-b border-plum/5 transition-opacity duration-500"
                >
                  <span className="mono-label w-16 text-plum-muted">
                    {d === 0 ? <span className="text-lg text-plum">→</span> : `(${String(i + 1).padStart(3, "0")})`}
                  </span>
                  <span
                    className={`text-right text-[clamp(1.05rem,1.6vw,1.35rem)] transition-all duration-500 ${
                      d === 0 ? "translate-x-0 text-plum" : "-translate-x-2 text-plum-muted"
                    }`}
                  >
                    {f}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
