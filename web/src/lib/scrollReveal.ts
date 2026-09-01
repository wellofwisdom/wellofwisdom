// SPDX-License-Identifier: AGPL-3.0-or-later
// Scroll as timeline, for the one screen where it earns its keep: the world.
//
// Deliberately small and dependency-free. Two primitives:
//   useReveal   an element announces itself when it enters view, once
//   useProgress how far through a container the reader has scrolled, 0 to 1
//
// Everything here is off when the reader asked for less motion. That is not a
// nicety in this app: the audience includes a lot of children who were failed
// by environments that would not sit still, and a learning path that lurches
// when you scroll is worse than one that does not move at all.
import { useEffect, useRef, useState } from "react";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True once the element has been seen. Never flips back, so nothing
 *  re-animates when a learner scrolls up to re-read something. */
export function useReveal<T extends HTMLElement = HTMLDivElement>(rootMargin = "-12% 0px") {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== "function") {
      setShown(true); // no observer, no hiding: content must never be stuck invisible
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin, threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, rootMargin]);

  return { ref, shown };
}

/** How far the reader has scrolled through an element, clamped 0 to 1.
 *  Used to draw the journey's path as they travel it. */
export function useScrollProgress<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setProgress(1); // draw the whole path at once rather than not at all
      return;
    }
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // 0 when the top reaches the middle of the screen, 1 when the bottom does.
      const total = rect.height + vh;
      const seen = vh - rect.top;
      setProgress(Math.max(0, Math.min(1, seen / total)));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return { ref, progress };
}
