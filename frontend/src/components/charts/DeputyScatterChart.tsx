import { memo, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { DeputadoComparacaoOut } from '../../types/api';
import { formatBRL, formatBRLCompact, formatInt } from '../../utils/format';
import {
  clamp,
  EDITORIAL_EASE,
  INSTANT_TRANSITION,
  r1,
  SPRING_TOOLTIP,
} from './chartMotion';

interface DeputyScatterChartProps {
  selectedUf: string;
  selectedAno: number;
  deputies: DeputadoComparacaoOut[];
  maxDep: number;
  medianDep: number;
  onOpenDeputy: (id: number) => void;
}

const VB_W = 600;
const VB_H = 198;
const PLOT_LEFT = 24;
const PLOT_RIGHT = 562; // generous right padding so max tick & circles never clip
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
const PLOT_TOP = 26;
const PLOT_BOTTOM = 156;
const TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

function deterministicJitter(id: number, idx: number): number {
  const seed = Math.sin(id * 12.9898 + idx * 78.233) * 43758.5453;
  const frac = seed - Math.floor(seed);
  return (frac - 0.5) * 92;
}

/**
 * Dispersão (Bee-swarm) por parlamentar — Parte A.3 fix:
 * - Margem direita generosa e ancoragem `textAnchor="end"` no último tick
 *   para que o rótulo máximo do eixo X ("R$ 451,7 mil" / "mi") NUNCA corte.
 * - Badge MED com posição X limitada dentro da área útil.
 */
export const DeputyScatterChart = memo(function DeputyScatterChart({
  selectedUf,
  selectedAno,
  deputies,
  maxDep,
  medianDep,
  onOpenDeputy,
}: DeputyScatterChartProps) {
  const shouldReduce = useReducedMotion();
  const [hoveredDep, setHoveredDep] = useState<DeputadoComparacaoOut | null>(null);

  const safeMax = maxDep > 0 ? maxDep : 1;

  const medX = useMemo(
    () => r1(PLOT_LEFT + (clamp(medianDep, 0, safeMax) / safeMax) * PLOT_W),
    [medianDep, safeMax]
  );

  const clampedMedPillX = clamp(medX, PLOT_LEFT + 22, PLOT_RIGHT - 22);

  const plottedNodes = useMemo(
    () =>
      deputies.map((dep, idx) => {
        const cx = r1(PLOT_LEFT + (clamp(dep.total_liquido, 0, safeMax) / safeMax) * PLOT_W);
        const cy = r1(92 + deterministicJitter(dep.deputado_id, idx));
        return {
          dep,
          cx,
          cy,
          xPct: (cx / VB_W) * 100,
          yPct: (cy / VB_H) * 100,
        };
      }),
    [deputies, safeMax]
  );

  const activeNode = useMemo(() => {
    if (!hoveredDep) return null;
    return plottedNodes.find((n) => n.dep.deputado_id === hoveredDep.deputado_id) ?? null;
  }, [plottedNodes, hoveredDep]);

  return (
    <div className="scatter-panel">
      <div className="scatter-stage" onMouseLeave={() => setHoveredDep(null)}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="scatter-svg"
          role="img"
          aria-label={`Dispersão de despesas dos parlamentares de ${selectedUf} em ${selectedAno}`}
        >
          {/* Baseline X axis */}
          <line
            x1={PLOT_LEFT}
            y1={PLOT_BOTTOM}
            x2={PLOT_RIGHT}
            y2={PLOT_BOTTOM}
            stroke="rgba(37, 32, 26, 0.24)"
          />

          {/* Vertical gridlines & clamped X-axis labels */}
          {TICKS.map((frac) => {
            const x = r1(PLOT_LEFT + frac * PLOT_W);
            const anchor = frac === 0 ? 'start' : frac === 1 ? 'end' : 'middle';
            const labelX = frac === 1 ? r1(Math.min(VB_W - 10, x + 16)) : x;
            return (
              <g key={frac}>
                <line
                  x1={x}
                  y1={PLOT_TOP}
                  x2={x}
                  y2={PLOT_BOTTOM}
                  stroke="rgba(37, 32, 26, 0.08)"
                  strokeDasharray="2 3"
                />
                <text
                  x={labelX}
                  y={176}
                  textAnchor={anchor}
                  fill="#6C6357"
                  fontSize="10"
                  className="mono"
                >
                  {formatBRLCompact(safeMax * frac)}
                </text>
              </g>
            );
          })}

          {/* Median reference line & clamped badge */}
          {medianDep > 0 ? (
            <g pointerEvents="none">
              <line
                x1={medX}
                y1={20}
                x2={medX}
                y2={PLOT_BOTTOM}
                stroke="rgba(37, 32, 26, 0.56)"
                strokeDasharray="4 4"
                strokeWidth="1.2"
              />
              <rect
                x={r1(clampedMedPillX - 18)}
                y={4}
                width={36}
                height={15}
                rx={3}
                fill="#25201A"
              />
              <text
                x={r1(clampedMedPillX)}
                y={14.5}
                textAnchor="middle"
                fill="#FAF7F0"
                fontSize="9"
                fontWeight="700"
              >
                MED
              </text>
            </g>
          ) : null}

          {/* Deputy scatter nodes */}
          {plottedNodes.map(({ dep, cx, cy }, idx) => {
            const isHovered = hoveredDep?.deputado_id === dep.deputado_id;
            const isDimmed = hoveredDep !== null && !isHovered;
            return (
              <motion.circle
                key={dep.deputado_id}
                cx={cx}
                cy={cy}
                r={isHovered ? 9.5 : 6.8}
                fill={isHovered ? '#CE4233' : '#B83628'}
                stroke={isHovered ? '#25201A' : '#FAF7F0'}
                strokeWidth={isHovered ? 2.2 : 1.5}
                initial={shouldReduce ? false : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: isDimmed ? 0.3 : 0.92 }}
                transition={
                  shouldReduce
                    ? INSTANT_TRANSITION
                    : {
                        duration: 0.32,
                        delay: Math.min(idx * 0.018, 0.35),
                        ease: EDITORIAL_EASE,
                      }
                }
                style={{ cursor: 'pointer', transformOrigin: `${cx}px ${cy}px` }}
                tabIndex={0}
                role="button"
                aria-label={`${dep.nome_parlamentar} (${dep.partido ?? 'S/P'}): ${formatBRL(dep.total_liquido)}. Abrir perfil`}
                onMouseEnter={() => setHoveredDep(dep)}
                onMouseLeave={() => setHoveredDep(null)}
                onFocus={() => setHoveredDep(dep)}
                onBlur={() => setHoveredDep(null)}
                onClick={() => onOpenDeputy(dep.deputado_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenDeputy(dep.deputado_id);
                  }
                }}
              >
                <title>
                  {dep.nome_parlamentar} ({dep.partido ?? 'S/P'}): {formatBRL(dep.total_liquido)}
                </title>
              </motion.circle>
            );
          })}
        </svg>

        <AnimatePresence>
          {activeNode ? (
            <motion.div
              key="scatter-tip"
              className={`scatter-tooltip${activeNode.yPct < 42 ? ' scatter-tooltip--below' : ''}`}
              style={
                activeNode.yPct < 42
                  ? { left: `${clamp(activeNode.xPct, 18, 82)}%`, x: '-50%', top: `${r1(activeNode.yPct)}%` }
                  : { left: `${clamp(activeNode.xPct, 18, 82)}%`, x: '-50%', bottom: `${r1(100 - activeNode.yPct)}%` }
              }
              initial={shouldReduce ? false : { opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduce ? { opacity: 0 } : { opacity: 0, y: 3, scale: 0.97 }}
              transition={shouldReduce ? INSTANT_TRANSITION : SPRING_TOOLTIP}
              role="status"
            >
              <strong>{activeNode.dep.nome_parlamentar}</strong>
              <span className="scatter-tooltip__party">{activeNode.dep.partido ?? 'S/P'}</span>
              <div className="scatter-tooltip__val mono tabular">
                {formatBRL(activeNode.dep.total_liquido)}
              </div>
              <div className="scatter-tooltip__sub tabular">
                {formatInt(activeNode.dep.qtd_despesas)} notas · Clique para abrir
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="scatter-summary tabular">
        {hoveredDep ? (
          <>
            <span>
              <strong>{hoveredDep.nome_parlamentar}</strong> ({hoveredDep.partido ?? 'S/P'}) ·{' '}
              {formatBRL(hoveredDep.total_liquido)}
            </span>
            <span className="scatter-summary-muted">
              {formatInt(hoveredDep.qtd_despesas)} notas · Clique no ponto para abrir o perfil
            </span>
          </>
        ) : (
          <>
            <span>Passe sobre um ponto para inspecionar; clique para abrir o perfil.</span>
            <span className="scatter-summary-muted">
              Mediana no estado: {formatBRL(medianDep)}
            </span>
          </>
        )}
      </div>
    </div>
  );
});
