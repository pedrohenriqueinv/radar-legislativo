import { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';
import { formatBRL, formatInt, formatPct } from '../../utils/format';

interface AnimatedNumberProps {
  value: number;
  kind?: 'brl' | 'brl_whole' | 'int' | 'pct';
  duration?: number;
  className?: string;
}

const CONTRA_EASE: [number, number, number, number] = [0.48, 0.05, 0.35, 0.99];

/**
 * Contador numérico animado inspirado em Contra Labs 2026 e no vídeo de referência:
 * anima suavemente de 0 na entrada do viewport e interpola entre valores ao trocar filtros.
 */
export function AnimatedNumber({
  value,
  kind = 'brl',
  duration = 0.72,
  className = '',
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-5% 0px' });
  const shouldReduce = useReducedMotion();
  const [displayVal, setDisplayVal] = useState<number>(shouldReduce ? value : 0);
  const prevRef = useRef<number>(shouldReduce ? value : 0);

  useEffect(() => {
    if (shouldReduce) {
      prevRef.current = value;
      setDisplayVal(value);
      return;
    }
    if (!inView) return;

    const from = prevRef.current;
    const controls = animate(from, value, {
      duration,
      ease: CONTRA_EASE,
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
  }, [value, inView, shouldReduce, duration]);

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

  return (
    <span ref={ref} className={`tabular ${className}`}>
      {formatted}
    </span>
  );
}
