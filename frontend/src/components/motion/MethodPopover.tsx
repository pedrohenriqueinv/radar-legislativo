import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { HelpCircle, X } from 'lucide-react';
import { FluidTooltip } from './FluidTooltip';

interface MethodPopoverProps {
  title: string;
  body: string;
  sourceLabel?: string;
  /** Preferred side; 'auto' flips cleanly when near viewport edges. */
  placement?: 'auto' | 'top' | 'bottom' | 'top-end' | 'bottom-end' | 'top-start' | 'bottom-start';
  /** Tooltip label shown on hover/focus of the `?` button before clicking. */
  tooltipLabel?: string;
}

const POPOVER_SPRING = {
  type: 'spring' as const,
  stiffness: 440,
  damping: 32,
  mass: 0.72,
};

/**
 * Popover explicativo acionado por ícone `?`, com FluidTooltip no gatilho
 * e reposicionamento inteligente contra cortes de viewport ou sobreposição.
 */
export function MethodPopover({
  title,
  body,
  sourceLabel,
  placement = 'auto',
  tooltipLabel = 'Ver nota metodológica e fonte',
}: MethodPopoverProps) {
  const [open, setOpen] = useState(false);
  const [resolvedPos, setResolvedPos] = useState<{
    vertical: 'top' | 'bottom';
    shiftX: number;
  }>({ vertical: 'bottom', shiftX: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();

  const recomputePosition = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof window === 'undefined') return;

    const triggerRect = wrap.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const estimatedHeight = cardRef.current?.offsetHeight ?? 175;
    const cardWidth = cardRef.current?.offsetWidth ?? Math.min(300, vw - 32);

    const spaceBelow = vh - triggerRect.bottom;
    const spaceAbove = triggerRect.top;

    let vertical: 'top' | 'bottom';
    if (placement === 'top' || placement === 'top-end' || placement === 'top-start') {
      vertical = spaceAbove >= estimatedHeight + 16 || spaceAbove >= spaceBelow ? 'top' : 'bottom';
    } else if (
      placement === 'bottom' ||
      placement === 'bottom-end' ||
      placement === 'bottom-start'
    ) {
      vertical = spaceBelow >= estimatedHeight + 16 || spaceBelow >= spaceAbove ? 'bottom' : 'top';
    } else {
      vertical = spaceBelow >= estimatedHeight + 18 ? 'bottom' : spaceAbove > spaceBelow ? 'top' : 'bottom';
    }

    // Clamp horizontally when aligned right: 0 so card never clips outside viewport
    const defaultLeft = triggerRect.right - cardWidth;
    let shiftX = 0;
    const margin = 14;
    if (defaultLeft < margin) {
      shiftX = margin - defaultLeft;
    } else if (triggerRect.right > vw - margin) {
      shiftX = vw - margin - triggerRect.right;
    }

    setResolvedPos({ vertical, shiftX: Math.round(shiftX) });
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) return;
    recomputePosition();
  }, [open, recomputePosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleViewport = () => recomputePosition();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEsc);
    window.addEventListener('resize', handleViewport, { passive: true });
    window.addEventListener('scroll', handleViewport, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEsc);
      window.removeEventListener('resize', handleViewport);
      window.removeEventListener('scroll', handleViewport);
    };
  }, [open, recomputePosition]);

  return (
    <div ref={wrapRef} className="method-popover-wrap" data-open={open}>
      <FluidTooltip content={tooltipLabel} placement="top" disabled={open}>
        <button
          type="button"
          className="method-trigger"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`Metodologia: ${title}`}
        >
          <HelpCircle size={15} />
        </button>
      </FluidTooltip>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={cardRef}
            initial={
              shouldReduce
                ? { opacity: 0, x: resolvedPos.shiftX }
                : { opacity: 0, x: resolvedPos.shiftX, y: resolvedPos.vertical === 'top' ? 6 : -6, scale: 0.97 }
            }
            animate={{ opacity: 1, x: resolvedPos.shiftX, y: 0, scale: 1 }}
            exit={
              shouldReduce
                ? { opacity: 0, x: resolvedPos.shiftX }
                : { opacity: 0, x: resolvedPos.shiftX, y: 4, scale: 0.97 }
            }
            transition={shouldReduce ? { duration: 0.01 } : POPOVER_SPRING}
            className={`method-popover-card method-popover-card--${resolvedPos.vertical}`}
            data-placement={resolvedPos.vertical}
            role="dialog"
            aria-label={title}
          >
            <div className="method-popover-head">
              <strong>{title}</strong>
              <button
                type="button"
                className="method-close"
                aria-label="Fechar explicação"
                onClick={() => setOpen(false)}
              >
                <X size={13} />
              </button>
            </div>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '0.8rem',
                lineHeight: 1.48,
                color: 'var(--ink-secondary)',
              }}
            >
              {body}
            </p>
            {sourceLabel && (
              <p style={{ margin: '8px 0 0', fontSize: '0.73rem', color: 'var(--ink-muted)' }}>
                {sourceLabel}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
