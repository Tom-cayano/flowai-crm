"use client";

import { useEffect, useRef } from "react";
import { useInView } from "framer-motion";

interface CountUpOptions {
  duration?: number;     // seconds
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

// Animates a <span> from 0 to target when it enters the viewport.
// Uses rAF directly — no framer-motion overhead in the render loop.
// ref must be attached to the span that will display the number.
export function useCountUp(
  target: number,
  { duration = 0.9, prefix = "", suffix = "", decimals = 0 }: CountUpOptions = {}
) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const isInView = useInView(spanRef, { once: true, margin: "0px 0px -40px 0px" });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isInView || !spanRef.current) return;

    const start = performance.now();
    const ms = duration * 1000;

    function tick(now: number) {
      if (!spanRef.current) return;
      const progress = Math.min((now - start) / ms, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * target;
      spanRef.current.textContent =
        prefix + current.toFixed(decimals) + suffix;
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isInView, target, duration, prefix, suffix, decimals]);

  return spanRef;
}
