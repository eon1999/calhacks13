"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { NAV_LINKS } from "./content";
import { Wordmark } from "./wordmark";

/**
 * Floating glass pill at the bottom of the screen: menu toggle, wordmark,
 * and a breathing orb that jumps into the wearable simulator.
 */
export function PillNav({ visible }: { visible: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const orb = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!visible || !root.current) return;
    const a = animate(root.current, { y: ["140%", "0%"], opacity: [0, 1], duration: 1100, ease: "out(4)" });
    return () => {
      a.revert();
    };
  }, [visible]);

  useEffect(() => {
    if (!orb.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = animate(orb.current, {
      rotate: "1turn",
      scale: [1, 1.08, 1],
      duration: 6000,
      ease: "linear",
      loop: true,
    });
    return () => {
      a.revert();
    };
  }, []);

  useEffect(() => {
    if (!open || !menu.current) return;
    const a = animate(menu.current.querySelectorAll("[data-item]"), {
      y: ["120%", "0%"],
      opacity: [0, 1],
      duration: 700,
      ease: "out(4)",
      delay: stagger(50),
    });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      a.revert();
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <nav
      ref={root}
      aria-label="Main"
      className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,340px)] -translate-x-1/2 opacity-0"
    >
      {open && (
        <div
          ref={menu}
          id="pill-menu"
          className="glass-pill mb-3 overflow-hidden rounded-[28px] px-6 py-5 text-plum"
        >
          <ul className="space-y-1">
            {NAV_LINKS.map((l, i) => (
              <li key={l.href} className="overflow-hidden">
                <Link
                  data-item
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="group flex items-baseline gap-3 py-1"
                >
                  <span className="mono-label text-plum-muted">[{String(i + 1).padStart(2, "0")}]</span>
                  <span className="display text-4xl transition-colors group-hover:text-violet">{l.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="glass-pill glass-pill-dark flex h-14 items-center justify-between px-3 text-white">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="pill-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-white/10"
        >
          <span className="relative block h-3 w-5">
            <span
              className={`absolute left-0 h-px w-5 bg-white transition-all duration-300 ${
                open ? "top-1.5 rotate-45" : "top-0.5"
              }`}
            />
            <span
              className={`absolute left-0 h-px w-5 bg-white transition-all duration-300 ${
                open ? "top-1.5 -rotate-45" : "top-2.5"
              }`}
            />
          </span>
        </button>

        <Link href="/" aria-label="Cadence home" className="text-2xl">
          <Wordmark className="[&_.text-violet]:text-[#d9b8ff]" />
        </Link>

        <Link
          href="/hub"
          aria-label="Talk to the wristband"
          title="Talk to the wristband"
          className="grid h-10 w-10 place-items-center rounded-full"
        >
          <span
            ref={orb}
            className="block h-8 w-8 rounded-full shadow-[0_0_18px_rgb(255_200_255/0.7)]"
            style={{
              background:
                "conic-gradient(from 0deg, #ffffff, #e0b6ff, #9047ff, #7fd3ff, #ffd1f3, #ffffff)",
            }}
          />
        </Link>
      </div>
    </nav>
  );
}
