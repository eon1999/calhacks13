"use client";

import Link from "next/link";
import { NAV_LINKS } from "./content";
import { GlassButton } from "./glass-button";
import { Headline } from "./headline";
import { useReveal } from "./use-reveal";
import { Wordmark } from "./wordmark";

const CTA_LINES = [{ em: "Let's", text: "keep" }, { text: "every day" }, { text: "in rhythm" }];

const RESOURCES = [
  { href: "/hub", label: "Wearable simulator" },
  { href: "/api/voice/patient", label: "Voice API" },
  { href: "/demo", label: "Seed a demo" },
];

/** Closing CTA, link columns, and a full-width wordmark. */
export function Closing() {
  const cta = useReveal<HTMLDivElement>({ when: "scroll" });

  return (
    <footer className="bg-lilac px-5 pb-28 text-plum md:px-10">
      <div ref={cta} className="invisible py-20 md:py-28">
        <span data-fade className="tag-pill">
          ▸ Stay in rhythm
        </span>
        <Headline lines={CTA_LINES} className="mt-5 text-[clamp(3.2rem,8vw,8rem)]" />
        <div data-fade className="mt-10 flex flex-wrap items-center gap-6">
          <GlassButton href="/hub">Try the wristband</GlassButton>
          <p className="mono-label max-w-[36ch] text-plum-muted">
            Have a loved one, a patient, or a clinic in mind? Start with the simulator. No hardware needed.
          </p>
        </div>
      </div>

      <div className="grid gap-10 border-t border-plum/15 pt-10 sm:grid-cols-3">
        <FooterColumn title="Pages" links={NAV_LINKS} />
        <FooterColumn title="Build" links={RESOURCES} />
        <div>
          <p className="mono-label text-plum-muted">About</p>
          <p className="mono-label mt-4 max-w-[30ch]">
            Made at Cal Hacks 13. Built with Claude, Cartesia, Convex and Next.js.
          </p>
        </div>
      </div>

      <Wordmark className="mt-16 block w-full text-[clamp(5rem,27vw,26rem)] leading-[0.8] text-plum/90" />
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="mono-label text-plum-muted">{title}</p>
      <ul className="mt-4 space-y-2">
        {links.map((l, i) => (
          <li key={l.href}>
            <Link href={l.href} className="mono-label group inline-flex gap-3 hover:text-violet">
              <span className="text-plum-muted">[{String(i + 1).padStart(2, "0")}]</span>
              <span className="relative">
                {l.label}
                <span className="absolute -bottom-0.5 left-0 h-px w-full origin-right scale-x-0 bg-current transition-transform duration-300 group-hover:origin-left group-hover:scale-x-100" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
