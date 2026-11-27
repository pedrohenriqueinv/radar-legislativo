import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

export type TooltipPlacement = 'top' | 'bottom';

interface ActiveTooltipState {
  key: string;
  content: ReactNode;
  shortcut?: string;
  placement: TooltipPlacement;
  anchorRect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
}

interface FluidTooltipContextValue {
  groupId: string;
  activeKey: string | null;
  tooltipDomId: string;
  show: (next: ActiveTooltipState) => void;
  hide: (key: string) => void;
  hideImmediately: (key?: string) => void;
}

const FluidTooltipContext = createContext<FluidTooltipContextValue | null>(null);

const MORPH_SPRING = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 34,
  mass: 0.72,
};

interface FluidTooltipGroupProps {
  id: string;
  children: ReactNode;
  /** Grace delay (ms) before closing so moving between neighboring triggers morphs seamlessly. */
  closeDelayMs?: number;
}

export function FluidTooltipGroup({
  id,
  children,
  closeDelayMs = 110,
}: FluidTooltipGroupProps) {
  const [active, setActive] = useState<ActiveTooltipState | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const shouldReduce = useReducedMotion();
  const uniqueSuffix = useId();
  const tooltipDomId = `fluid-tip-${id}-${uniqueSuffix}`;

  const clearPendingClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const show = useCallback(
    (next: ActiveTooltipState) => {
      clearPendingClose();
      setActive(next);
    },
    [clearPendingClose]
  );

  const hide = useCallback(
    (key: string) => {
      clearPendingClose();
      closeTimerRef.current = window.setTimeout(() => {
        setActive((prev) => (prev && prev.key === key ? null : prev));
        closeTimerRef.current = null;
      }, closeDelayMs);
    },
    [clearPendingClose, closeDelayMs]
  );

  const hideImmediately = useCallback(
    (key?: string) => {
      clearPendingClose();
      setActive((prev) => (!key || (prev && prev.key === key) ? null : prev));
    },
    [clearPendingClose]
  );

  useEffect(() => {
    if (!active) return;
    const dismissOnScrollOrEsc = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      hideImmediately();
    };
    window.addEventListener('scroll', dismissOnScrollOrEsc, { passive: true, capture: true });
    window.addEventListener('keydown', dismissOnScrollOrEsc);
    return () => {
      window.removeEventListener('scroll', dismissOnScrollOrEsc, true);
      window.removeEventListener('keydown', dismissOnScrollOrEsc);
    };
  }, [active, hideImmediately]);

  useEffect(() => clearPendingClose, [clearPendingClose]);

  const contextValue = useMemo<FluidTooltipContextValue>(
    () => ({
      groupId: id,
      activeKey: active?.key ?? null,
      tooltipDomId,
      show,
      hide,
      hideImmediately,
    }),
    [id, active?.key, tooltipDomId, show, hide, hideImmediately]
  );

  const portalNode =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {active ? (
              <FluidTooltipBubble
                key="fluid-pill"
                groupId={id}
                domId={tooltipDomId}
                active={active}
                reduced={Boolean(shouldReduce)}
              />
            ) : null}
          </AnimatePresence>,
          document.body
        )
      : null;

  return (
    <FluidTooltipContext.Provider value={contextValue}>
      {children}
      {portalNode}
    </FluidTooltipContext.Provider>
  );
}

interface FluidTooltipBubbleProps {
  groupId: string;
  domId: string;
  active: ActiveTooltipState;
  reduced: boolean;
}

function FluidTooltipBubble({ groupId, domId, active, reduced }: FluidTooltipBubbleProps) {
  const { anchorRect, placement, content, shortcut, key } = active;
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [measuredHalfW, setMeasuredHalfW] = useState<number>(145);

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const width = el.offsetWidth;
    if (width > 0) {
      setMeasuredHalfW(Math.ceil(width / 2));
    }
  }, [key, content, shortcut]);

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  // Smart vertical flip if preferred side lacks room
  const resolvedPlacement: TooltipPlacement =
    placement === 'top' && anchorRect.top < 54
      ? 'bottom'
      : placement === 'bottom' && vh - anchorRect.bottom < 54
        ? 'top'
        : placement;

  // Center horizontally on anchor and clamp strictly inside [halfW + 12, vw - halfW - 12]
  const edgeMargin = 12;
  const maxSafeHalfW = Math.max(0, (vw - edgeMargin * 2) / 2);
  const effectiveHalfW = Math.min(measuredHalfW, maxSafeHalfW);
  const minCenterX = edgeMargin + effectiveHalfW;
  const maxCenterX = vw - edgeMargin - effectiveHalfW;
  const centerX = anchorRect.left + anchorRect.width / 2;
  const clampedCenterX =
    minCenterX > maxCenterX
      ? Math.round(vw / 2)
      : Math.round(Math.max(minCenterX, Math.min(maxCenterX, centerX)));

  const y = resolvedPlacement === 'top' ? anchorRect.top - 9 : anchorRect.bottom + 9;
  const shiftY = resolvedPlacement === 'top' ? 4 : -4;

  return (
    <motion.div
      ref={bubbleRef}
      id={domId}
      role="tooltip"
      layout={!reduced}
      layoutId={reduced ? undefined : `fluid-tooltip-shell-${groupId}`}
      className={`fluid-tooltip-pill fluid-tooltip-pill--${resolvedPlacement}`}
      style={{
        left: clampedCenterX,
        top: y,
      }}
      initial={
        reduced
          ? { opacity: 0, x: '-50%', y: resolvedPlacement === 'top' ? '-100%' : '0%' }
          : {
              opacity: 0,
              scale: 0.94,
              x: '-50%',
              y: resolvedPlacement === 'top' ? `calc(-100% + ${shiftY}px)` : `${shiftY}px`,
            }
      }
      animate={{
        opacity: 1,
        scale: 1,
        x: '-50%',
        y: resolvedPlacement === 'top' ? '-100%' : '0%',
      }}
      exit={
        reduced
          ? { opacity: 0 }
          : {
              opacity: 0,
              scale: 0.95,
              transition: { duration: 0.11 },
            }
      }
      transition={reduced ? { duration: 0.01 } : MORPH_SPRING}
    >
      <motion.span
        key={key}
        className="fluid-tooltip-content"
        initial={reduced ? false : { opacity: 0.25, filter: 'blur(1.5px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        transition={reduced ? { duration: 0.01 } : { duration: 0.14 }}
      >
        <span className="fluid-tooltip-text">{content}</span>
        {shortcut ? <kbd className="fluid-tooltip-kbd">{shortcut}</kbd> : null}
      </motion.span>
    </motion.div>
  );
}

export interface FluidTooltipProps {
  content: ReactNode;
  shortcut?: string;
  placement?: TooltipPlacement;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

function FluidTooltipTrigger({
  content,
  shortcut,
  placement = 'top',
  disabled = false,
  children,
  className = '',
}: FluidTooltipProps) {
  const ctx = useContext(FluidTooltipContext);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const key = useId();

  const triggerShow = useCallback(() => {
    if (disabled || !ctx || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    ctx.show({
      key,
      content,
      shortcut,
      placement,
      anchorRect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
    });
  }, [disabled, ctx, key, content, shortcut, placement]);

  const triggerHide = useCallback(() => {
    ctx?.hide(key);
  }, [ctx, key]);

  useEffect(() => {
    if (disabled) {
      ctx?.hideImmediately(key);
    }
  }, [disabled, ctx, key]);

  // Keep content live if active tooltip text updates while hovered
  useEffect(() => {
    if (!disabled && ctx && ctx.activeKey === key && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      ctx.show({
        key,
        content,
        shortcut,
        placement,
        anchorRect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      });
    }
  }, [content, shortcut, placement, disabled, ctx, key]);

  return (
    <span
      ref={triggerRef}
      className={`fluid-tooltip-anchor ${className}`.trim()}
      aria-describedby={ctx?.activeKey === key ? ctx.tooltipDomId : undefined}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') triggerShow();
      }}
      onPointerLeave={triggerHide}
      onFocus={(e) => {
        if (e.target.matches(':focus-visible')) triggerShow();
      }}
      onBlur={() => ctx?.hideImmediately(key)}
      onPointerDown={() => ctx?.hideImmediately(key)}
    >
      {children}
    </span>
  );
}

/**
 * Shared-element fluid tooltip. When placed inside a `<FluidTooltipGroup>`,
 * moving hover/focus across sibling triggers smoothly morphs position and width
 * via `motion/react` `layoutId`. Falls back gracefully to a standalone group if
 * rendered outside any `<FluidTooltipGroup>`.
 */
export function FluidTooltip(props: FluidTooltipProps) {
  const existingGroup = useContext(FluidTooltipContext);
  const fallbackId = useId();

  if (existingGroup) {
    return <FluidTooltipTrigger {...props} />;
  }

  return (
    <FluidTooltipGroup id={`solo-${fallbackId}`}>
      <FluidTooltipTrigger {...props} />
    </FluidTooltipGroup>
  );
}
