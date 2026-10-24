"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { animate } from "animejs";
import type { ShapeName } from "@/lib/landing/particles";
import { HERO, STORY, type StoryBeat } from "./content";
import { Headline } from "./headline";
import { ParticleField, type ParticleFieldHandle } from "./particle-field";
import { Sky } from "./sky";
import { useInView } from "./use-in-view";
import { useReveal } from "./use-reveal";

type OnActive = (index: number, shape: ShapeName) => void;

/** Fire `onActive` whenever the section crosses the middle of the viewport, either direction. */
function useActiveSection(index: number, shape: ShapeName, onActive: OnActive) {
  const ref = useRef<HTMLDivElement>(null);
  useInView(ref, () => onActive(index, shape), { rootMargin: "-50% 0px -50% 0px" });
  return ref;
}

function Hero({ ready, onActive }: { ready: boolean; onActive: OnActive }) {
  const section = useActiveSection(0, HERO.shape, onActive);
  const copy = useReveal<HTMLDivElement>({ when: ready, delay: 150 });
  const cue = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!cue.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = animate(cue.current, {
      scaleY: [0, 1, 0],
      translateY: ["-50%", "0%", "50%"],
      duration: 1800,
      ease: "inOutQuart",
      loop: true,
    });
    return () => {
      a.revert();
    };
  }, []);

  return (
    <div ref={section} className="relative z-10 flex min-h-[100svh] items-end px-5 pb-28 md:px-10 md:pb-32">
      <div ref={copy} className="invisible w-full">
        <p data-fade className="mono-label max-w-[30ch] text-white/90">
          {HERO.kicker}
        </p>
        <Headline
          as="h1"
          lines={HERO.lines}
          className="mt-5 text-[clamp(4.2rem,13vw,14rem)] text-white"
        />
        <div data-fade className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 text-white/85">
          <span className="mono-label flex items-center gap-3">
            <span className="relative block h-8 w-px overflow-hidden bg-white/25">
              <span ref={cue} className="absolute inset-0 origin-top bg-white" />
            </span>
            Scroll to explore
          </span>
        </div>
      </div>
    </div>
  );
}

function Beat({ beat, index, onActive }: { beat: StoryBeat; index: number; onActive: OnActive }) {
  const section = useActiveSection(index, beat.shape, onActive);
  const copy = useReveal<HTMLDivElement>({ when: "scroll" });

  return (
    <div ref={section} className="relative z-10 flex min-h-[115svh] items-end px-5 pb-28 md:px-10 md:pb-32">
      <div ref={copy} className="invisible max-w-[min(92vw,720px)]">
        <span data-fade className="tag-pill">
          {beat.tag}
        </span>
        <Headline lines={beat.lines} className="mt-5 text-[clamp(3.2rem,7.4vw,7.5rem)] text-white" />
        <p data-fade className="mono-label mt-6 max-w-[48ch] text-white/80">
          {beat.sub}
        </p>
      </div>
    </div>
  );
}

const BEATS = [{ tag: "Cadence" }, ...STORY];

/** Right-edge index of the story beats; the active one is lit. */
function StageIndex({ active }: { active: number }) {
  return (
    <ol className="absolute right-5 top-1/2 hidden -translate-y-1/2 flex-col items-end gap-2.5 md:flex md:right-10">
      {BEATS.map((b, i) => (
        <li
          key={b.tag}
          className={`mono-label flex items-center gap-2 transition-all duration-500 ${
            i === active ? "text-white" : "text-white/40"
          }`}
        >
          <span>{b.tag}</span>
          <span
            className={`block h-px bg-current transition-all duration-500 ${i === active ? "w-8" : "w-3"}`}
          />
          <span className="tabular-nums">{String(i).padStart(2, "0")}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The pinned story: a sticky sky + particle canvas behind the hero and four
 * beats. Each beat morphs the particles into its shape as it reaches mid-screen.
 */
export function StoryStage({ ready }: { ready: boolean }) {
  const field = useRef<ParticleFieldHandle>(null);
  const [active, setActive] = useState(0);

  const onActive = useCallback<OnActive>((index, shape) => {
    setActive(index);
    field.current?.morphTo(shape);
  }, []);

  return (
    <section className="relative bg-[#4a12a3]">
      <div className="sticky top-0 -mb-[100svh] h-[100svh] overflow-hidden">
        <Sky />
        <ParticleField ref={field} initialShape={HERO.shape} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#2a0f5c]/70 via-[#2a0f5c]/25 to-transparent" />
        <StageIndex active={active} />
      </div>
      <Hero ready={ready} onActive={onActive} />
      {STORY.map((beat, i) => (
        <Beat key={beat.id} beat={beat} index={i + 1} onActive={onActive} />
      ))}
    </section>
  );
}
