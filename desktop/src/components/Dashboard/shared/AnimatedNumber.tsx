import { useEffect, useState, useRef } from "react";

interface Props {
  value: number | null;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}

export function AnimatedNumber({
  value,
  decimals = 1,
  suffix = "",
  prefix = "",
  className,
}: Props) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const target = value ?? 0;
    if (target === prevValue.current && value !== null) {
      setDisplay(target);
      return;
    }

    const start = prevValue.current;
    const duration = 600;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (target - start) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    prevValue.current = target;

    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  if (value === null) return <span className={className}>—</span>;

  return (
    <span className={className}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
