import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { formatBRL, formatInt, formatPct } from '../../utils/format';

interface AnimatedNumberProps {
  value: number;
  kind?: 'brl' | 'brl_whole' | 'int' | 'pct';
  duration?: number;
  /** Kept for backward compatibility; first paint always displays the real value (never flashes 0). */
  animateOnMount?: boolean;
  className?: string;
}

const EDITORIAL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * Editorial tabular number display that ALWAYS renders the real value on first paint
 * (zero "0" or "R$ 0,00" flash before scroll) and smoothly interpolates when filters
 * or active cuts update the value. Respects prefers-reduced-motion.
 */
export function AnimatedNumber({
  value,
  kind = 'brl',
  duration = 0.48,
  className = '',
}: AnimatedNumberProps) {
  const shouldReduce = useReducedMotion();
  const [displayVal, setDisplayVal] = useState<number>(value);
  const prevRef = useRef<number>(value);

  useEffect(() => {
    if (shouldReduce || !Number.isFinite(value) || !Number.isFinite(prevRef.current)) {
      prevRef.current = value;
      setDisplayVal(value);
      return;
    }

    const from = prevRef.current;
    if (from === value) {
      setDisplayVal(value);
      return;
    }

    const controls = animate(from, value, {
      duration,
      ease: EDITORIAL_EASE,
      onUpdate: (latest) => {
        prevRef.current = latest;
        setDisplayVal(latest);
      },
      onComplete: () => {
        prevRef.current = value;
        setDisplayVal(value);
      },
    });

    return () => controls.stop();
  }, [value, shouldReduce, duration]);

  let formatted: string;
  if (kind === 'brl') {
    formatted = formatBRL(displayVal);
  } else if (kind === 'brl_whole') {
    formatted = formatBRL(displayVal, true);
  } else if (kind === 'pct') {
    formatted = formatPct(displayVal);
  } else {
    formatted = formatInt(displayVal);
  }

  return <span className={`tabular ${className}`}>{formatted}</span>;
}
