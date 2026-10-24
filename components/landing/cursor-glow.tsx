"use client";

import { useEffect, useRef } from "react";
import { createAnimatable } from "animejs";

/** Soft white orb that trails the pointer (fine pointers only). */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(pointer: fine)").matches) return;

    const orb = createAnimatable(el, { x: 650, y: 650, opacity: 400, ease: "out(3)" });
    const onMove = (e: PointerEvent) => {
      orb.x(e.clientX);
      orb.y(e.clientY);
      orb.opacity(1);
    };
    const onLeave = () => orb.opacity(0);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      orb.revert();
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[90] -ml-20 -mt-20 h-40 w-40 rounded-full opacity-0 mix-blend-soft-light"
      style={{
        background:
          "radial-gradient(circle, rgb(255 255 255 / 0.95) 0%, rgb(255 236 252 / 0.55) 35%, rgb(255 236 252 / 0) 70%)",
      }}
    />
  );
}
