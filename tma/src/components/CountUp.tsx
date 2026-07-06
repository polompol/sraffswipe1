import { useEffect, useRef, useState } from "react";

/** Плавно «накручивает» число от 0 (или прошлого значения) до target.
 *  Уважает prefers-reduced-motion — тогда показывает сразу. */
export function CountUp({
  value,
  duration = 1100,
  format = (n: number) => Math.round(n).toLocaleString("ru-RU"),
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setShown(from + (value - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <>{format(shown)}</>;
}
