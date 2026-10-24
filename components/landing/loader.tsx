"use client";

import { useEffect, useRef, useState } from "react";
import { createTimeline, stagger, utils } from "animejs";
import { Wordmark } from "./wordmark";

const DURATION = 1700;

/**
 * Intro curtain: wordmark, tagline, and an "experience is loading" bar that
 * counts to 100%, then lifts away and calls `onDone`.
 */
export function Loader({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.display = "none";
      onDone();
      return;
    }

    const progress = { v: 0 };
    const tl = createTimeline({
      onComplete: () => {
        setGone(true);
        onDone();
      },
    })
      .add(el.querySelectorAll("[data-letter]"), {
        y: ["100%", "0%"],
        opacity: [0, 1],
        duration: 900,
        ease: "out(4)",
        delay: stagger(45),
      })
      .add(el.querySelectorAll("[data-intro]"), { opacity: [0, 1], duration: 600 }, "-=500")
      .add(
        progress,
        {
          v: 100,
          duration: DURATION,
          ease: "inOutQuad",
          onUpdate: () => {
            const v = Math.round(progress.v);
            setPct(v);
            if (bar.current) utils.set(bar.current, { scaleX: v / 100 });
          },
        },
        "-=700",
      )
      .add(el, { clipPath: ["inset(0 0 0% 0)", "inset(0 0 100% 0)"], duration: 900, ease: "inOutExpo" }, "+=150");

    return () => {
      tl.revert();
    };
  }, [onDone]);

  if (gone) return null;

  return (
    <div ref={root} className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-lilac text-plum">
      <Wordmark animated className="text-[clamp(2.5rem,6vw,4rem)]" />
      <p data-intro className="mono-label mt-5 max-w-[30ch] text-center opacity-0">
        A voice companion for people living with Parkinson&apos;s
      </p>

      <div data-intro className="absolute inset-x-5 bottom-6 opacity-0 md:inset-x-10">
        <div className="h-px w-full bg-plum/10">
          <div ref={bar} className="h-px w-full origin-left scale-x-0 bg-plum" />
        </div>
        <div className="mono-label mt-3 flex items-center gap-8 text-plum-muted">
          <span>Experience is loading..</span>
          <span className="tabular-nums text-violet">{String(pct).padStart(3, "0")}%</span>
          <span className="ml-auto text-plum">100%</span>
        </div>
      </div>
    </div>
  );
}
