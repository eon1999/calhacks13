"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Calls `onEnter` each time the element starts intersecting the viewport
 * (shrunk by `rootMargin`). With `once`, it stops after the first time.
 * Used for "when" (section crossing, reveal on enter); anime.js does the "how".
 */
export function useInView(
  ref: RefObject<HTMLElement | null>,
  onEnter: () => void,
  { rootMargin = "0px", once = false, enabled = true } = {},
) {
  const callback = useRef(onEnter);
  useEffect(() => {
    callback.current = onEnter;
  }, [onEnter]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        callback.current();
        if (once) io.disconnect();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, once, enabled]);
}
