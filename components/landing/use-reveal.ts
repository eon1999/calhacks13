"use client";

import { useEffect, useRef } from "react";
import { createTimeline, splitText, stagger, utils, type Timeline } from "animejs";
import { useInView } from "./use-in-view";

interface RevealOptions {
  /** `true` plays now, `"scroll"` plays when the block scrolls into view, `false` waits. */
  when: boolean | "scroll";
  delay?: number;
}

/**
 * Masked word-by-word rise for every `[data-split]` heading inside the returned
 * ref, then a soft fade-up for every `[data-fade]` element. The root starts
 * `invisible` in markup so nothing flashes before the split happens.
 */
export function useReveal<T extends HTMLElement>({ when, delay = 0 }: RevealOptions) {
  const ref = useRef<T>(null);
  const timeline = useRef<Timeline | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || when === false) return;

    const splits = [...el.querySelectorAll<HTMLElement>("[data-split]")].map((node) =>
      splitText(node, { words: { wrap: "clip" } }),
    );
    const words = splits.flatMap((s) => s.words as HTMLElement[]);
    const fades = [...el.querySelectorAll<HTMLElement>("[data-fade]")];
    el.style.visibility = "visible";

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return () => splits.forEach((s) => s.revert());
    }

    utils.set(words, { y: "110%" });
    utils.set(fades, { opacity: 0, y: 14 });

    const tl = createTimeline({ delay, autoplay: when === true })
      .add(words, { y: "0%", duration: 1150, ease: "out(4)", delay: stagger(55) })
      .add(fades, { opacity: 1, y: 0, duration: 800, ease: "out(3)", delay: stagger(90) }, "-=850");
    timeline.current = tl;

    return () => {
      timeline.current = null;
      tl.revert();
      splits.forEach((s) => s.revert());
    };
  }, [when, delay]);

  useInView(ref, () => timeline.current?.play(), {
    rootMargin: "0px 0px -15% 0px",
    once: true,
    enabled: when === "scroll",
  });

  return ref;
}
