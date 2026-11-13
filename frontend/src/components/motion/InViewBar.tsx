import { useRef } from 'react';
import { motion, useInView } from 'motion/react';

const CONTRA_EASE: [number, number, number, number] = [0.48, 0.05, 0.35, 0.99];

interface AnimatedHBarProps {
  widthPct: number;
  delay?: number;
  color?: string;
  trackHeight?: number;
}

/**
 * Barra horizontal animada: observa a trilha (.hbar-track, que nunca colapsa para 0px)
 * em vez da barra interna em scaleX(0), garantindo disparo confiável no scroll.
 */
export function AnimatedHBar({ widthPct, delay = 0, color, trackHeight }: AnimatedHBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const inView = useInView(trackRef, { once: true, margin: '80px 0px' });

  return (
    <div
      ref={trackRef}
      className="hbar-track"
      style={trackHeight ? { height: trackHeight } : undefined}
    >
      <motion.div
        className="hbar-fill"
        initial={{ scaleX: 0 }}
        animate={inView ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{ duration: 0.54, delay, ease: CONTRA_EASE }}
        style={{
          width: `${widthPct}%`,
          ...(color ? { backgroundColor: color } : {}),
        }}
      />
    </div>
  );
}
