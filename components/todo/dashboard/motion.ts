"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Only acknowledge user-driven content changes, never stage a page-load reveal. */
export function useContentChange<T extends HTMLElement>(ref: RefObject<T | null>, value: string, selector?: string) {
  const previous = useRef(value);
  useLayoutEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    const node = selector ? ref.current?.querySelector(selector) : ref.current;
    if (!node) return;
    const animation = node.animate([{ opacity: .45 }, { opacity: 1 }], {
      duration: reducedMotion() ? 70 : 180,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
    });
    return () => animation.cancel();
  }, [ref, value, selector]);
}

/** Keep a modal mounted through its exit; repeated dismissals share one timer. */
export function useAnimatedDismiss(dismiss: () => void) {
  const [exiting, setExiting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(dismiss);
  useLayoutEffect(() => { latest.current = dismiss; });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const requestDismiss = useCallback(() => {
    if (timer.current) return;
    setExiting(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setExiting(false);
      latest.current();
    }, reducedMotion() ? 0 : 160);
  }, []);
  return { exiting, requestDismiss };
}
