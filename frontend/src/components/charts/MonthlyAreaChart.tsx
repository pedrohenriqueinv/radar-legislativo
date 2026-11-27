import {
  memo,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import type { CategoriaResumo, MensalResumo } from '../../types/api';
import {
  formatBRL,
  formatBRLCompact,
  formatInt,
  formatPct,
  getMonthLabel,
  shortenCategory,
} from '../../utils/format';
import {
  clamp,
  DONUT_PALETTE,
  EDITORIAL_EASE,
  INSTANT_TRANSITION,
  r1,
  SPRING_SNAPPY,
  SPRING_TOOLTIP,
} from './chartMotion';

interface MonthlyAreaChartProps {
  selectedUf: string;
  selectedAno: number;
  viewMode: 'area' | 'barras';
  series: MensalResumo[];
  categories: CategoriaResumo[];
}

interface ComputedMonthPoint extends MensalResumo {
  x: number;
  y: number;
  barTop: number;
  barHeight: number;
  xPct: number;
  yPct: number;
  momDeltaPct: number | null;
  prevMonthName: string | null;
  vsAvgPct: number | null;
}

const VB_W = 600;
const VB_H = 198;
const PLOT_LEFT = 54;
const PLOT_RIGHT = 580;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 158;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;

function buildSmoothCurvePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${r1(points[0].x)} ${r1(points[0].y)}`;
  let d = `M ${r1(points[0].x)} ${r1(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = r1((p0.x + p1.x) / 2);
    d += ` C ${midX} ${r1(p0.y)}, ${midX} ${r1(p1.y)}, ${r1(p1.x)} ${r1(p1.y)}`;
  }
  return d;
}

function buildSparkPath(values: number[], maxVal: number, width: number, height: number): {
  line: string;
  area: string;
  coords: { x: number; y: number }[];
} {
  if (values.length === 0) return { line: '', area: '', coords: [] };
  const padX = 2;
  const padY = 3;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const denom = maxVal > 0 ? maxVal : 1;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;

  const coords = values.map((v, i) => ({
    x: r1(padX + i * step),
    y: r1(padY + innerH - (Math.max(0, v) / denom) * innerH),
  }));

  const line = buildSmoothCurvePath(coords);
  const first = coords[0];
  const last = coords[coords.length - 1];
  const baseline = r1(height - padY);
  const area = `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
  return { line, area, coords };
}

function formatAxisCompact(val: number): string {
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(1).replace('.', ',')}M`;
  }
  if (val >= 1_000) {
    return `${Math.round(val / 1_000)}k`;
  }
  return `${Math.round(val)}`;
}

function formatSignedPct(val: number): string {
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1).replace('.', ',')}%`;
}

/**
 * Evolução mensal das despesas (B.1):
 * - Alterna entre Área contínua com crosshair vertical interativo e Barras com topo arredondado e destaque terracota
 * - Linha horizontal tracejada de média (AVG) com pill legível "Média R$ ..."
 * - Tooltip flutuante suave (HTML wrapper) com valor exato em R$, variação MoM % e deputados/notas
 * - Mini-sparklines sincronizadas pelas principais categorias logo abaixo
 */
export const MonthlyAreaChart = memo(function MonthlyAreaChart({
  selectedUf,
  selectedAno,
  viewMode,
  series,
  categories,
}: MonthlyAreaChartProps) {
  const uid = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement>(null);
  const plotWrapRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, amount: 0.1 });
  const shouldReduce = useReducedMotion();

  const [hoveredMes, setHoveredMes] = useState<number | null>(null);
  const [pinnedMes, setPinnedMes] = useState<number | null>(null);
  const [hoveredSparkCat, setHoveredSparkCat] = useState<string | null>(null);

  const activeMes = hoveredMes ?? pinnedMes;

  const { maxMes, avgMes, avgY, points, areaLinePath, areaFillPath } = useMemo(() => {
    let maxVal = 1;
    let activeSum = 0;
    let activeCount = 0;
    for (const m of series) {
      const abs = Math.abs(m.total_liquido);
      if (abs > maxVal) maxVal = abs;
      if (m.qtd_lancamentos > 0) {
        activeSum += m.total_liquido;
        activeCount += 1;
      }
    }
    const mean = activeCount > 0 ? activeSum / activeCount : 0;
    const meanY = r1(PLOT_BOTTOM - (Math.max(0, mean) / maxVal) * PLOT_H);

    const count = Math.max(series.length, 1);
    let prevActive: MensalResumo | null = null;

    const computed: ComputedMonthPoint[] = series.map((m, idx) => {
      const fracX = count > 1 ? idx / (count - 1) : 0.5;
      const x = r1(PLOT_LEFT + fracX * PLOT_W);
      const val = Math.max(0, m.total_liquido);
      const y = r1(PLOT_BOTTOM - (val / maxVal) * PLOT_H);
      const barH = r1(Math.max(val > 0 ? 4 : 0, (val / maxVal) * PLOT_H));
      const barTop = r1(PLOT_BOTTOM - barH);

      let momDeltaPct: number | null = null;
      let prevMonthName: string | null = null;
      if (m.qtd_lancamentos > 0 && prevActive && Math.abs(prevActive.total_liquido) > 0.01) {
        momDeltaPct = ((m.total_liquido - prevActive.total_liquido) / Math.abs(prevActive.total_liquido)) * 100;
        prevMonthName = prevActive.mes_nome;
      }
      if (m.qtd_lancamentos > 0) {
        prevActive = m;
      }

      const vsAvgPct =
        mean > 0 && m.qtd_lancamentos > 0 ? ((m.total_liquido - mean) / mean) * 100 : null;

      return {
        ...m,
        x,
        y,
        barTop,
        barHeight: barH,
        xPct: (x / VB_W) * 100,
        yPct: (y / VB_H) * 100,
        momDeltaPct,
        prevMonthName,
        vsAvgPct,
      };
    });

    const line = buildSmoothCurvePath(computed);
    let fill = '';
    if (computed.length > 0) {
      const first = computed[0];
      const last = computed[computed.length - 1];
      fill = `${line} L ${r1(last.x)} ${PLOT_BOTTOM} L ${r1(first.x)} ${PLOT_BOTTOM} Z`;
    }

    return {
      maxMes: maxVal,
      avgMes: mean,
      avgY: meanY,
      points: computed,
      areaLinePath: line,
      areaFillPath: fill,
    };
  }, [series]);

  const activePoint = useMemo(() => {
    if (activeMes === null) return null;
    return points.find((p) => p.mes === activeMes) ?? null;
  }, [points, activeMes]);

  const activeMonthIndex = useMemo(() => {
    if (activeMes === null) return -1;
    return points.findIndex((p) => p.mes === activeMes);
  }, [points, activeMes]);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (points.length === 0 || !plotWrapRef.current) return;
      const rect = plotWrapRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const relX = ((event.clientX - rect.left) / rect.width) * VB_W;
      let nearest = points[0];
      let bestDist = Math.abs(relX - nearest.x);
      for (let i = 1; i < points.length; i++) {
        const d = Math.abs(relX - points[i].x);
        if (d < bestDist) {
          bestDist = d;
          nearest = points[i];
        }
      }
      setHoveredMes((prev) => (prev === nearest.mes ? prev : nearest.mes));
    },
    [points]
  );

  const handlePointerLeave = useCallback(() => {
    setHoveredMes(null);
  }, []);

  const topSparklines = useMemo(() => {
    const topCats = categories.slice(0, 4);
    if (topCats.length === 0 || series.length === 0) return [];
    const topShare = Math.max(...topCats.map((c) => Math.max(0, c.percentual) / 100), 0.01);
    const sharedMaxMonthly = maxMes * topShare;

    return topCats.map((cat, idx) => {
      const share = Math.max(0, cat.percentual) / 100;
      const values = series.map((m) => Math.max(0, m.total_liquido * share));
      const { line, area, coords } = buildSparkPath(values, sharedMaxMonthly, 116, 30);
      return {
        categoria: cat.categoria,
        shortLabel: shortenCategory(cat.categoria),
        total_liquido: cat.total_liquido,
        percentual: cat.percentual,
        qtd_lancamentos: cat.qtd_lancamentos,
        ticketMedio: cat.qtd_lancamentos > 0 ? cat.total_liquido / cat.qtd_lancamentos : 0,
        color: DONUT_PALETTE[idx % DONUT_PALETTE.length],
        line,
        area,
        coords,
      };
    });
  }, [categories, series, maxMes]);

  const avgPillTopPct = clamp((avgY / VB_H) * 100, 12, 74);
  // Tooltip flanks the crosshair (right side for Jan–Jun, left side for Jul–Dez) so it never hides the hairline
  const tooltipStyle: CSSProperties = activePoint
    ? activePoint.xPct <= 52
      ? { left: `calc(${r1(activePoint.xPct)}% + 12px)` }
      : { right: `calc(${r1(100 - activePoint.xPct)}% + 12px)` }
    : {};
  const barWidth = points.length > 0 ? r1(Math.min(28, (PLOT_W / points.length) * 0.62)) : 24;

  return (
    <div ref={containerRef} className="monthly-evolution">
      <div
        ref={plotWrapRef}
        className="monthly-plot-wrap"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="monthly-svg"
          role="img"
          aria-label={`Evolução mensal das despesas em ${selectedUf} em ${selectedAno}`}
        >
          <defs>
            <linearGradient id={`area-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#B83628" stopOpacity="0.28" />
              <stop offset="72%" stopColor="#B83628" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#B83628" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id={`bar-active-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E0503E" />
              <stop offset="55%" stopColor="#B83628" />
              <stop offset="100%" stopColor="#96291D" />
            </linearGradient>
            <linearGradient id={`bar-rest-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D16D54" />
              <stop offset="100%" stopColor="#B83628" />
            </linearGradient>
            <filter id={`bar-glow-${uid}`} x="-25%" y="-15%" width="150%" height="135%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#B83628" floodOpacity="0.42" />
            </filter>
          </defs>

          {/* Horizontal editorial gridlines */}
          {[0.25, 0.5, 0.75, 1].map((frac) => {
            const y = r1(PLOT_BOTTOM - frac * PLOT_H);
            return (
              <g key={frac}>
                <line
                  x1={PLOT_LEFT - 4}
                  y1={y}
                  x2={PLOT_RIGHT + 4}
                  y2={y}
                  stroke="rgba(37, 32, 26, 0.1)"
                  strokeDasharray="2 3"
                />
                <text
                  x={PLOT_LEFT - 10}
                  y={r1(y + 3.5)}
                  textAnchor="end"
                  fill="#6C6357"
                  fontSize="10"
                  className="mono"
                >
                  {formatAxisCompact(maxMes * frac)}
                </text>
              </g>
            );
          })}

          {/* Baseline rule */}
          <line
            x1={PLOT_LEFT - 4}
            y1={PLOT_BOTTOM}
            x2={PLOT_RIGHT + 4}
            y2={PLOT_BOTTOM}
            stroke="rgba(37, 32, 26, 0.24)"
            strokeWidth="1.2"
          />

          {viewMode === 'area' ? (
            <>
              {/* Subtle rounded-top column highlight behind active month */}
              {activePoint && activePoint.barHeight > 0 ? (
                <rect
                  x={r1(activePoint.x - barWidth / 2)}
                  y={activePoint.barTop}
                  width={barWidth}
                  height={activePoint.barHeight}
                  rx={5}
                  ry={5}
                  fill="rgba(184, 54, 40, 0.11)"
                />
              ) : null}

              {/* Smooth area fill & stroke */}
              <g>
                {areaFillPath ? (
                  <motion.path
                    key={`fill-${selectedUf}-${selectedAno}`}
                    d={areaFillPath}
                    fill={`url(#area-grad-${uid})`}
                    initial={shouldReduce ? false : { opacity: 0 }}
                    animate={{ opacity: shouldReduce || inView ? 1 : 0 }}
                    transition={
                      shouldReduce
                        ? INSTANT_TRANSITION
                        : { duration: 0.55, delay: 0.15, ease: EDITORIAL_EASE }
                    }
                  />
                ) : null}
                {areaLinePath ? (
                  <motion.path
                    key={`line-${selectedUf}-${selectedAno}`}
                    d={areaLinePath}
                    fill="none"
                    stroke="#B83628"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={shouldReduce ? false : { pathLength: 0, opacity: 0.45 }}
                    animate={{
                      pathLength: shouldReduce || inView ? 1 : 0,
                      opacity: shouldReduce || inView ? 1 : 0.45,
                    }}
                    transition={
                      shouldReduce
                        ? INSTANT_TRANSITION
                        : { duration: 0.85, ease: EDITORIAL_EASE }
                    }
                  />
                ) : null}
              </g>

              {/* Vertical interactive crosshair */}
              {activePoint ? (
                <g pointerEvents="none">
                  <line
                    x1={activePoint.x}
                    y1={PLOT_TOP - 8}
                    x2={activePoint.x}
                    y2={PLOT_BOTTOM}
                    stroke="rgba(37, 32, 26, 0.42)"
                    strokeWidth="1.15"
                    strokeDasharray="3 3"
                  />
                  {activePoint.qtd_lancamentos > 0 ? (
                    <circle
                      cx={activePoint.x}
                      cy={activePoint.y}
                      r={10}
                      fill="rgba(184, 54, 40, 0.18)"
                    />
                  ) : null}
                </g>
              ) : null}
            </>
          ) : (
            /* Rounded-top terracotta bars with glowing active highlight */
            <g>
              {points.map((pt, idx) => {
                const isActive = activeMes === pt.mes;
                const isDimmed = activeMes !== null && !isActive;
                const x = r1(pt.x - barWidth / 2);
                const radius = Math.min(6, r1(pt.barHeight / 2));
                const dBar =
                  pt.barHeight > 0
                    ? `M ${x} ${PLOT_BOTTOM} L ${x} ${r1(pt.barTop + radius)} Q ${x} ${pt.barTop} ${r1(x + radius)} ${pt.barTop} L ${r1(x + barWidth - radius)} ${pt.barTop} Q ${r1(x + barWidth)} ${pt.barTop} ${r1(x + barWidth)} ${r1(pt.barTop + radius)} L ${r1(x + barWidth)} ${PLOT_BOTTOM} Z`
                    : '';
                return (
                  <g key={`bar-${pt.mes}`}>
                    {dBar ? (
                      <motion.path
                        d={dBar}
                        fill={
                          isActive
                            ? `url(#bar-active-grad-${uid})`
                            : `url(#bar-rest-grad-${uid})`
                        }
                        stroke={isActive ? '#25201A' : 'none'}
                        strokeWidth={isActive ? 1.15 : 0}
                        filter={isActive ? `url(#bar-glow-${uid})` : undefined}
                        initial={shouldReduce ? false : { opacity: 0 }}
                        animate={{
                          opacity: shouldReduce || inView ? (isDimmed ? 0.44 : 1) : 0,
                        }}
                        transition={
                          shouldReduce
                            ? INSTANT_TRANSITION
                            : { duration: 0.36, delay: idx * 0.025, ease: EDITORIAL_EASE }
                        }
                      />
                    ) : (
                      <rect
                        x={x}
                        y={PLOT_BOTTOM - 2}
                        width={barWidth}
                        height={2}
                        rx={1}
                        fill="rgba(37, 32, 26, 0.16)"
                      />
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* Horizontal dashed AVG mean line */}
          {avgMes > 0 ? (
            <line
              x1={PLOT_LEFT - 4}
              y1={avgY}
              x2={PLOT_RIGHT + 4}
              y2={avgY}
              stroke="rgba(37, 32, 26, 0.52)"
              strokeDasharray="5 4"
              strokeWidth="1.25"
              pointerEvents="none"
            />
          ) : null}

          {/* Interactive hit targets, nodes, and X-axis month labels */}
          {points.map((pt) => {
            const isActive = activeMes === pt.mes;
            const isPinned = pinnedMes === pt.mes;
            const hasEntries = pt.qtd_lancamentos > 0;
            return (
              <g
                key={pt.mes}
                style={{ cursor: 'pointer' }}
                tabIndex={0}
                role="button"
                aria-pressed={isPinned}
                aria-label={`${getMonthLabel(pt.mes)} ${selectedAno}: ${formatBRL(pt.total_liquido)}, ${formatInt(pt.qtd_lancamentos)} lançamentos`}
                onClick={() => setPinnedMes((prev) => (prev === pt.mes ? null : pt.mes))}
                onFocus={() => setHoveredMes(pt.mes)}
                onBlur={() => setHoveredMes(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPinnedMes((prev) => (prev === pt.mes ? null : pt.mes));
                  } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const step = e.key === 'ArrowRight' ? 1 : -1;
                    const idx = points.findIndex((p) => p.mes === pt.mes);
                    const next = points[(idx + step + points.length) % points.length];
                    if (next) {
                      setHoveredMes(next.mes);
                      setPinnedMes(next.mes);
                    }
                  }
                }}
              >
                <rect
                  x={r1(pt.x - 22)}
                  y={PLOT_TOP - 10}
                  width={44}
                  height={PLOT_BOTTOM - PLOT_TOP + 38}
                  fill="transparent"
                />
                {viewMode === 'area' && hasEntries ? (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isActive ? 5.5 : 3.5}
                    fill={isActive ? '#CE4233' : '#FAF7F0'}
                    stroke={isActive ? '#25201A' : '#B83628'}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                ) : null}
                <text
                  x={pt.x}
                  y={180}
                  textAnchor="middle"
                  fill={isActive ? '#25201A' : '#6C6357'}
                  fontWeight={isActive ? 700 : 500}
                  fontSize="11"
                >
                  {pt.mes_nome}
                </text>
                {isPinned ? (
                  <circle cx={pt.x} cy={188} r={2.2} fill="#B83628" />
                ) : null}
              </g>
            );
          })}
        </svg>

        {/* Crisp HTML floating AVG pill aligned cleanly with dashed line */}
        {avgMes > 0 ? (
          <div
            className="monthly-avg-pill tabular"
            style={{ top: `${avgPillTopPct}%` }}
            aria-hidden="true"
          >
            <span className="monthly-avg-tag">AVG</span>
            <span>Média {formatBRLCompact(avgMes)}</span>
          </div>
        ) : null}

        {/* Smooth floating HTML tooltip wrapper (avoids animating SVG DOM directly) */}
        <AnimatePresence>
          {activePoint ? (
            <motion.div
              key="monthly-tooltip"
              className="monthly-tooltip"
              style={tooltipStyle}
              initial={shouldReduce ? false : { opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.97 }}
              transition={shouldReduce ? INSTANT_TRANSITION : SPRING_TOOLTIP}
              role="status"
              aria-live="polite"
            >
              <div className="monthly-tooltip__head">
                <strong>
                  {getMonthLabel(activePoint.mes)}/{selectedAno}
                </strong>
                {activePoint.momDeltaPct !== null ? (
                  <span
                    className={`monthly-delta-pill tabular ${
                      activePoint.momDeltaPct > 0
                        ? 'monthly-delta-pill--up'
                        : activePoint.momDeltaPct < 0
                          ? 'monthly-delta-pill--down'
                          : 'monthly-delta-pill--flat'
                    }`}
                  >
                    {formatSignedPct(activePoint.momDeltaPct)} vs. {activePoint.prevMonthName}
                  </span>
                ) : activePoint.qtd_lancamentos > 0 ? (
                  <span className="monthly-delta-pill monthly-delta-pill--flat">
                    1º mês ativo
                  </span>
                ) : null}
              </div>
              <div className="monthly-tooltip__val serif-display tabular">
                {formatBRL(activePoint.total_liquido)}
              </div>
              <div className="monthly-tooltip__meta tabular">
                <span>
                  {formatInt(activePoint.qtd_lancamentos)} notas ·{' '}
                  {formatInt(activePoint.qtd_deputados_ativos)} dep. ativos
                </span>
                {activePoint.vsAvgPct !== null ? (
                  <span className="monthly-tooltip__avg">
                    {formatSignedPct(activePoint.vsAvgPct)} vs. média
                  </span>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Summary footer strip */}
      <div className="monthly-summary-strip tabular">
        {activePoint ? (
          <>
            <span>
              <strong>
                {getMonthLabel(activePoint.mes)}/{selectedAno}
              </strong>
              : {formatBRL(activePoint.total_liquido)}
              {activePoint.momDeltaPct !== null ? (
                <em className="monthly-summary-delta">
                  {' '}
                  ({formatSignedPct(activePoint.momDeltaPct)} vs. mês anterior)
                </em>
              ) : null}
            </span>
            <span className="monthly-summary-muted">
              {pinnedMes === activePoint.mes
                ? 'Fixado · clique novamente para soltar'
                : 'Clique para fixar mês'}
            </span>
          </>
        ) : (
          <>
            <span>Passe o cursor ou clique em qualquer mês para inspecionar a variação.</span>
            <span className="monthly-summary-muted">Média mensal: {formatBRL(avgMes)}</span>
          </>
        )}
      </div>

      {/* Category mini-sparklines strip */}
      {topSparklines.length > 0 ? (
        <div className="sparklines-block" aria-label="Mini-tendências por principais categorias">
          <div className="sparklines-head">
            <span className="sparklines-kicker">Principais rubricas no período</span>
            <span className="sparklines-note">Escala proporcional à série mensal</span>
          </div>
          <div className="sparklines-grid">
            {topSparklines.map((sp) => {
              const isFocused = hoveredSparkCat === sp.categoria;
              const activeDot =
                activeMonthIndex >= 0 && sp.coords[activeMonthIndex]
                  ? sp.coords[activeMonthIndex]
                  : null;
              return (
                <motion.div
                  key={sp.categoria}
                  className={`sparkline-card${isFocused ? ' sparkline-card--active' : ''}`}
                  onMouseEnter={() => setHoveredSparkCat(sp.categoria)}
                  onMouseLeave={() => setHoveredSparkCat(null)}
                  whileHover={shouldReduce ? undefined : { y: -1 }}
                  transition={shouldReduce ? INSTANT_TRANSITION : SPRING_SNAPPY}
                >
                  <div className="sparkline-card__top">
                    <span className="sparkline-card__title" title={sp.categoria}>
                      <span
                        className="sparkline-dot"
                        style={{ backgroundColor: sp.color }}
                        aria-hidden="true"
                      />
                      <span>{sp.shortLabel}</span>
                    </span>
                    <span className="sparkline-card__pct mono tabular">
                      {formatPct(sp.percentual)}
                    </span>
                  </div>

                  <div className="sparkline-card__viz">
                    <svg
                      viewBox="0 0 116 30"
                      className="sparkline-svg"
                      aria-hidden="true"
                    >
                      {sp.area ? (
                        <path d={sp.area} fill={sp.color} fillOpacity={isFocused ? 0.2 : 0.11} />
                      ) : null}
                      {sp.line ? (
                        <path
                          d={sp.line}
                          fill="none"
                          stroke={sp.color}
                          strokeWidth={isFocused ? 1.9 : 1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : null}
                      {activeDot ? (
                        <circle
                          cx={activeDot.x}
                          cy={activeDot.y}
                          r={2.8}
                          fill={sp.color}
                          stroke="#FAF7F0"
                          strokeWidth={1.2}
                        />
                      ) : null}
                    </svg>
                    <div className="sparkline-card__nums tabular">
                      <strong>{formatBRLCompact(sp.total_liquido)}</strong>
                      <span>
                        {isFocused
                          ? `~${formatBRLCompact(sp.ticketMedio)}/nota`
                          : `${formatInt(sp.qtd_lancamentos)} notas`}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
});
