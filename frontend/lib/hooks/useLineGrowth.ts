'use client';

import { useState, useEffect, useRef } from 'react';

type AnyPoint = Record<string, any>;

export function useLineGrowth<T extends AnyPoint>(
  data: T[],
  yKeys: string[],
  duration: number = 1500,
): T[] {
  const [display, setDisplay] = useState<T[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (data.length === 0) {
      setDisplay([]);
      return;
    }

    // Floor = lowest value per key. Every point grows FROM the floor UP to its value.
    const floors: Record<string, number> = {};
    for (const key of yKeys) {
      let min = Infinity;
      for (const p of data) {
        const v = Number(p[key] ?? 0);
        if (v < min) min = v;
      }
      floors[key] = min === Infinity ? 0 : min;
    }

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

      const next = data.map((point) => {
        const out: any = { ...point };
        for (const key of yKeys) {
          const to = Number(point[key] ?? 0);
          out[key] = floors[key] + (to - floors[key]) * eased;
        }
        return out as T;
      });
      setDisplay(next);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [data, duration, yKeys.join(',')]);

  return display;
}