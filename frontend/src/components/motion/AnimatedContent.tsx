import { useEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface AnimatedContentProps {
  children: ReactNode;
  distance?: number;
  duration?: number;
  delay?: number;
  className?: string;
}

/**
 * Port adaptado em TypeScript de ReactBits AnimatedContent (GSAP + ScrollTrigger),
 * respeitando prefers-reduced-motion e usando gsap.context() para limpeza segura.
 */
export function AnimatedContent({
  children,
  distance = 20,
  duration = 0.45,
  delay = 0,
  className = '',
}: AnimatedContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      gsap.set(el, { opacity: 1, y: 0, clearProps: 'transform' });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y: distance },
        {
          opacity: 1,
          y: 0,
          duration,
          delay,
          ease: 'power3.out',
          clearProps: 'opacity,transform',
          scrollTrigger: {
            trigger: el,
            start: 'top 92%',
            once: true,
          },
        }
      );
    }, ref);

    return () => ctx.revert();
  }, [distance, duration, delay]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}
    >
      {children}
    </div>
  );
}
