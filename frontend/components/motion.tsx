"use client";

import { animate, useInView, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useRef, useState } from "react";

export const EASE = [0.2, 0, 0, 1] as const;

/** Parent of a staggered list: children with `itemVariants` enter one after another (40 ms apart). */
export const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.03 } },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.28, ease: EASE } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.16, ease: EASE } },
};

/** Animated number (counts up when it scrolls into view; instant with reduced motion). */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      from.current = value;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion: jump straight to the value
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, { duration: 0.7, ease: EASE, onUpdate: (v) => setShown(Math.round(v)) });
    from.current = value;
    return () => controls.stop();
  }, [inView, value, reduce]);
  return (
    <span ref={ref} className={className}>
      {shown}
    </span>
  );
}

/** Reveals text character by character ("streaming" feel). Returns the full text with reduced motion. */
export function useTypewriter(text: string, active: boolean, cps = 90) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(active && !reduce ? 0 : text.length);
  useEffect(() => {
    if (!active || reduce) return;
    const id = setInterval(() => setN((c) => (c >= text.length ? (clearInterval(id), c) : c + 2)), 1000 / cps);
    return () => clearInterval(id);
  }, [text, active, reduce, cps]);
  return { text: text.slice(0, n), done: n >= text.length };
}
