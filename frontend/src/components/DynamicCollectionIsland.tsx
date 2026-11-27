import { memo, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Database,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from 'lucide-react';
import type { ExecucaoOut } from '../types/api';
import { formatInt } from '../utils/format';

export type IslandPhase =
  | 'connecting'
  | 'processing'
  | 'saving'
  | 'completa'
  | 'parcial'
  | 'falhou';

export interface CollectionIslandState {
  uf: string;
  ano: number;
  phase: IslandPhase;
  deputadosProcessados: number;
  deputadosEsperados: number;
  despesasColetadas: number;
  despesasInseridas: number;
  despesasAtualizadas: number;
  nota?: string | null;
  execucao?: ExecucaoOut | null;
}

interface DynamicCollectionIslandProps {
  state: CollectionIslandState | null;
  storageLabel: string;
  onDismiss: () => void;
  onRetry?: (uf: string, ano: number) => void;
}

const ISLAND_SPRING = {
  type: 'spring' as const,
  stiffness: 390,
  damping: 31,
  mass: 0.82,
};

const STAGES = [
  { id: 'connecting', label: 'Conectando à Câmara' },
  { id: 'processing', label: 'Processando despesas' },
  { id: 'saving', label: 'Salvando recorte' },
] as const;

function getStageIndex(phase: IslandPhase): number {
  if (phase === 'connecting') return 0;
  if (phase === 'processing') return 1;
  if (phase === 'saving') return 2;
  return 3;
}

function getProgressPct(state: CollectionIslandState): number {
  if (state.phase === 'completa') return 100;
  if (state.phase === 'parcial') return 100;
  if (state.phase === 'falhou') return 100;
  if (state.phase === 'saving') return 94;
  if (state.phase === 'connecting') return 14;
  const expected = Math.max(state.deputadosEsperados, 1);
  const ratio = state.deputadosProcessados / expected;
  return Math.max(20, Math.min(90, Math.round(18 + ratio * 72)));
}

/**
 * Floating non-blocking Dynamic Collection Island inspired by Dynamic Release Island,
 * styled in Radar Legislativo's editorial broadsheet palette (ink #25201A / newsprint #FAF7F0 /
 * terracotta #B83628 / green #1D6848 sweep on completion).
 */
export const DynamicCollectionIsland = memo(function DynamicCollectionIsland({
  state,
  storageLabel,
  onDismiss,
  onRetry,
}: DynamicCollectionIslandProps) {
  const [expanded, setExpanded] = useState(false);
  const [headerOffset, setHeaderOffset] = useState(58);
  const shouldReduce = useReducedMotion();

  // Track visible header bottom so the island sits cleanly below HeaderNav and glides up when header hides
  useEffect(() => {
    if (!state || typeof window === 'undefined') return;

    const updateOffset = () => {
      const header = document.querySelector<HTMLElement>('.site-header-wrap');
      if (!header) {
        setHeaderOffset(14);
        return;
      }
      const hidden = header.getAttribute('data-scroll-hidden') === 'true';
      if (hidden) {
        setHeaderOffset(14);
      } else {
        const rect = header.getBoundingClientRect();
        setHeaderOffset(Math.max(14, Math.round(rect.bottom) + 10));
      }
    };

    updateOffset();
    const header = document.querySelector<HTMLElement>('.site-header-wrap');
    const mutationObserver = header
      ? new MutationObserver(updateOffset)
      : null;
    if (header && mutationObserver) {
      mutationObserver.observe(header, { attributes: true, attributeFilter: ['data-scroll-hidden'] });
    }
    const resizeObserver = header ? new ResizeObserver(updateOffset) : null;
    if (header && resizeObserver) {
      resizeObserver.observe(header);
    }
    window.addEventListener('resize', updateOffset, { passive: true });
    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateOffset);
    };
  }, [state]);

  // Collapse detail drawer automatically when transitioning into a terminal state
  useEffect(() => {
    if (state && (state.phase === 'completa' || state.phase === 'parcial' || state.phase === 'falhou')) {
      setExpanded(false);
    }
  }, [state?.phase]);

  const isRunning =
    state?.phase === 'connecting' ||
    state?.phase === 'processing' ||
    state?.phase === 'saving';
  const isComplete = state?.phase === 'completa';
  const isPartial = state?.phase === 'parcial';
  const isFailed = state?.phase === 'falhou';

  const progressPct = state ? getProgressPct(state) : 0;
  const stageIdx = state ? getStageIndex(state.phase) : 0;

  let primaryHeadline = '';
  let secondarySummary = '';

  if (state) {
    if (state.phase === 'connecting') {
      primaryHeadline = `Conectando à Câmara · ${state.uf}/${state.ano}`;
      secondarySummary = 'Consultando legislaturas e lista oficial de parlamentares…';
    } else if (state.phase === 'processing') {
      primaryHeadline = `Processando despesas · ${state.uf}/${state.ano}`;
      secondarySummary = `${formatInt(state.deputadosProcessados)} / ${formatInt(
        Math.max(state.deputadosEsperados, state.deputadosProcessados)
      )} deputados · ${formatInt(state.despesasColetadas)} despesas`;
    } else if (state.phase === 'saving') {
      primaryHeadline = `Salvando recorte · ${state.uf}/${state.ano}`;
      secondarySummary = `Gravando ${formatInt(state.despesasColetadas)} registros em ${storageLabel}…`;
    } else if (state.phase === 'completa') {
      primaryHeadline = `Coleta ${state.uf}/${state.ano} concluída`;
      secondarySummary = `${formatInt(state.deputadosProcessados)} deputados · ${formatInt(
        state.despesasColetadas
      )} despesas`;
    } else if (state.phase === 'parcial') {
      primaryHeadline = `Coleta parcial em ${state.uf}/${state.ano}`;
      secondarySummary =
        state.nota ||
        `${formatInt(state.deputadosProcessados)} deputados · registros válidos preservados`;
    } else {
      primaryHeadline = `Falha na coleta ${state.uf}/${state.ano}`;
      secondarySummary = state.nota || 'Não foi possível concluir a consulta à API oficial.';
    }
  }

  return (
    <div
      className="collection-island-viewport"
      style={{ top: headerOffset }}
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence>
        {state ? (
          <motion.aside
            key="collection-island"
            layout={!shouldReduce}
            role="status"
            aria-label={`Status da coleta ${state.uf}/${state.ano}`}
            className={`collection-island collection-island--${state.phase} ${
              expanded ? 'collection-island--expanded' : ''
            }`}
            initial={shouldReduce ? { opacity: 0 } : { opacity: 0, y: -22, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduce ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.94 }}
            transition={shouldReduce ? { duration: 0.01 } : ISLAND_SPRING}
          >
            {/* Editorial green left-to-right sweep overlay + translucent sheen on completion */}
            {isComplete ? (
              <>
                <motion.span
                  aria-hidden="true"
                  className="collection-island-sweep"
                  initial={shouldReduce ? { scaleX: 1 } : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={
                    shouldReduce
                      ? { duration: 0.01 }
                      : { duration: 0.56, ease: [0.22, 1, 0.36, 1] }
                  }
                />
                {!shouldReduce ? (
                  <motion.span
                    aria-hidden="true"
                    className="collection-island-sheen"
                    initial={{ x: '-110%' }}
                    animate={{ x: '130%' }}
                    transition={{ duration: 0.68, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
                  />
                ) : null}
              </>
            ) : null}

            <div className="collection-island-row">
              <span className="collection-island-badge" aria-hidden="true">
                {isRunning ? (
                  <Loader2 size={15} className="collection-island-spin" />
                ) : isComplete ? (
                  <motion.span
                    initial={shouldReduce ? false : { scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={shouldReduce ? { duration: 0.01 } : ISLAND_SPRING}
                    style={{ display: 'inline-flex' }}
                  >
                    <Check size={15} strokeWidth={2.6} />
                  </motion.span>
                ) : isPartial ? (
                  <AlertTriangle size={15} />
                ) : (
                  <XCircle size={15} />
                )}
              </span>

              <div className="collection-island-copy">
                <div className="collection-island-title">{primaryHeadline}</div>
                <div className="collection-island-sub tabular">{secondarySummary}</div>
              </div>

              <div className="collection-island-controls">
                {isRunning ? (
                  <button
                    type="button"
                    className="collection-island-icon-btn"
                    onClick={() => setExpanded((prev) => !prev)}
                    aria-expanded={expanded}
                    aria-label={expanded ? 'Recolher detalhes da coleta' : 'Expandir detalhes da coleta'}
                  >
                    <motion.span
                      animate={{ rotate: expanded ? 180 : 0 }}
                      transition={shouldReduce ? { duration: 0.01 } : { duration: 0.18 }}
                      style={{ display: 'inline-flex' }}
                    >
                      <ChevronDown size={15} />
                    </motion.span>
                  </button>
                ) : null}

                {isFailed && onRetry ? (
                  <button
                    type="button"
                    className="collection-island-retry-btn"
                    onClick={() => onRetry(state.uf, state.ano)}
                  >
                    <RefreshCw size={12} />
                    Tentar
                  </button>
                ) : null}

                <button
                  type="button"
                  className="collection-island-icon-btn"
                  onClick={onDismiss}
                  aria-label="Dispensar indicador de coleta"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {isRunning ? (
              <div className="collection-island-progress-track" aria-hidden="true">
                <motion.div
                  className={`collection-island-progress-fill ${
                    state.phase === 'connecting' ? 'collection-island-progress-fill--pulse' : ''
                  }`}
                  initial={false}
                  animate={{ width: `${progressPct}%` }}
                  transition={shouldReduce ? { duration: 0.01 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            ) : null}

            <AnimatePresence initial={false}>
              {expanded && isRunning ? (
                <motion.div
                  key="island-details"
                  className="collection-island-details"
                  initial={shouldReduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={shouldReduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={shouldReduce ? { duration: 0.01 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  <ol className="collection-island-steps">
                    {STAGES.map((stage, idx) => {
                      const done = idx < stageIdx;
                      const current = idx === stageIdx;
                      return (
                        <li
                          key={stage.id}
                          className={`collection-island-step ${
                            done
                              ? 'collection-island-step--done'
                              : current
                                ? 'collection-island-step--current'
                                : ''
                          }`}
                        >
                          <span className="collection-island-step-dot" aria-hidden="true">
                            {done ? <Check size={10} strokeWidth={3} /> : idx + 1}
                          </span>
                          <span>{stage.label}</span>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="collection-island-meta-row mono">
                    <span>
                      <Database size={11} aria-hidden="true" /> {storageLabel}
                    </span>
                    <span className="tabular">
                      +{formatInt(state.despesasInseridas)} novas · {formatInt(state.despesasAtualizadas)} atualiz.
                    </span>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
});
