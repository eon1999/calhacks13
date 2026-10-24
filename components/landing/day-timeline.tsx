"use client";

import { DAY } from "./content";
import { useReveal } from "./use-reveal";

const TOTAL = DAY.reduce((n, d) => n + d.moments.length, 0);

/** "A day with Cadence": a ledger of moments, styled like the inspo's awards table. */
export function DayTimeline() {
  const root = useReveal<HTMLElement>({ when: "scroll" });

  // `relative` so this paints over the hero's sticky sky, which overhangs its section by one screen.
  return (
    <section ref={root} className="invisible relative bg-lilac px-5 py-28 text-plum md:px-10 md:py-40">
      <h2 data-split className="display text-[clamp(3rem,7vw,7rem)]">
        A day <em>with</em> Cadence
      </h2>
      <p data-fade className="mono-label mt-6 max-w-[40ch]">
        What Mom&apos;s day looks like, and how much of it reaches you, from waking up to lights out. Hover a moment to
        see it land.
      </p>
      <span data-fade className="tag-pill mt-5">
        ▸ Total: {TOTAL} moments
      </span>

      <div className="mt-14">
        {DAY.map((part) => (
          <div key={part.part} data-fade className="border-t border-plum/60 pb-6 pt-4">
            <p className="text-sm font-medium uppercase tracking-wide">
              {part.part} <sup className="mono-label text-plum-muted">[{part.moments.length}]</sup>
            </p>
            <ul className="mt-2">
              {part.moments.map((m) => (
                <li
                  key={m.time}
                  className="group relative grid grid-cols-[1fr_auto] items-baseline gap-4 rounded-lg px-0 py-2.5 transition-all duration-300 hover:bg-white/70 hover:px-3 md:grid-cols-[1fr_10rem_5rem]"
                >
                  <span className="font-display text-xl transition-colors group-hover:text-violet md:text-2xl">
                    {m.label}
                  </span>
                  <span className="mono-label hidden text-plum-muted md:block">{m.kind}</span>
                  <span className="mono-label text-right tabular-nums">{m.time}</span>
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-0 h-px w-full origin-left scale-x-0 bg-violet transition-transform duration-500 group-hover:scale-x-100"
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
