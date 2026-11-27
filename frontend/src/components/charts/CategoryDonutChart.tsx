import { memo, useMemo, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import type { CategoriaResumo } from '../../types/api';
import { formatBRL, formatBRLCompact, formatInt, formatPct, shortenCategory } from '../../utils/format';
import { AnimatedHBar } from '../motion/InViewBar';
import { AnimatedNumber } from '../motion/AnimatedNumber';
import { DONUT_PALETTE, EDITORIAL_EASE, INSTANT_TRANSITION, r1 } from './chartMotion';

interface DonutSlice {
  categoria: string;
  shortLabel: string;
  total_liquido: number;
  percentual: number;
  qtd_lancamentos: number;
  color: string;
  circumference: number;
  arc: number;
  offset: number;
}

interface CategoryDonutChartProps {
  selectedUf: string;
  selectedAno: number;
  categories: CategoriaResumo[];
}

const SVG_SIZE = 168;
const CENTER = SVG_SIZE / 2; // 84
const RADIUS = 63;
const CIRCUMFERENCE = r1(2 * Math.PI * RADIUS);

/**
 * Composição por categoria — Donut + barras horizontais sincronizadas.
 * Corrige truncamento do texto central com envoltório balanceado em até 2–3 linhas
 * e fonte responsiva ao comprimento do rótulo.
 */
export const CategoryDonutChart = memo(function CategoryDonutChart({
  selectedUf,
  selectedAno,
  categories,
}: CategoryDonutChartProps) {
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
  const donutRef = useRef<HTMLDivElement>(null);
  const donutInView = useInView(donutRef, { once: true, amount: 0.1 });
  const shouldReduce = useReducedMotion();

  const maxCat = useMemo(() => {
    let max = 1;
    for (const c of categories) {
      const abs = Math.abs(c.total_liquido);
      if (abs > max) max = abs;
    }
    return max;
  }, [categories]);

  const donutSlices = useMemo<DonutSlice[]>(() => {
    if (categories.length === 0) return [];
    const top = categories.slice(0, 5);
    const rest = categories.slice(5);
    const combined =
      rest.length > 0
        ? [
            ...top,
            {
              categoria: `Outras (${rest.length} categorias)`,
              total_liquido: rest.reduce((acc, r) => acc + r.total_liquido, 0),
              percentual: rest.reduce((acc, r) => acc + r.percentual, 0),
              qtd_lancamentos: rest.reduce((acc, r) => acc + r.qtd_lancamentos, 0),
            },
          ]
        : top;

    let totalPos = 0;
    for (const s of combined) {
      totalPos += Math.max(0, s.total_liquido);
    }
    if (totalPos <= 0) totalPos = 1;

    let offsetAcc = 0;
    return combined.map((slice, idx) => {
      const share = Math.max(0, slice.total_liquido) / totalPos;
      const arc = r1(share * CIRCUMFERENCE);
      const offset = r1(-offsetAcc);
      offsetAcc += arc;
      return {
        ...slice,
        shortLabel: slice.categoria.startsWith('Outras (')
          ? slice.categoria
          : shortenCategory(slice.categoria),
        color: DONUT_PALETTE[idx % DONUT_PALETTE.length],
        circumference: CIRCUMFERENCE,
        arc,
        offset,
      };
    });
  }, [categories]);

  const activeSlice = useMemo(() => {
    if (donutSlices.length === 0) return null;
    if (hoveredCat) {
      return (
        donutSlices.find((s) => s.categoria === hoveredCat) ??
        donutSlices[donutSlices.length - 1]
      );
    }
    return donutSlices[0];
  }, [donutSlices, hoveredCat]);

  const centerLabelLength = activeSlice?.shortLabel.length ?? 0;
  const centerLabelSize =
    centerLabelLength > 26 ? '0.62rem' : centerLabelLength > 18 ? '0.67rem' : '0.72rem';

  const topList = useMemo(() => categories.slice(0, 6), [categories]);

  return (
    <div className="donut-split donut-split--refined">
      <div
        ref={donutRef}
        className="donut-wrap donut-wrap--refined"
        aria-label="Participação percentual das categorias"
      >
        <svg
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          className="donut-svg"
          role="img"
          aria-label={`Distribuição de despesas por categoria em ${selectedUf} (${selectedAno})`}
        >
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="var(--bg-inset)"
            strokeWidth="16"
          />
          {donutSlices.map((slice, idx) => {
            const isHovered = hoveredCat === slice.categoria;
            const isHighlighted = hoveredCat === null || isHovered;
            const targetDash = `${Math.max(0, r1(slice.arc - 1.4))} ${slice.circumference}`;
            return (
              <motion.circle
                key={`${selectedUf}-${selectedAno}-${slice.categoria}`}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={slice.color}
                strokeWidth={isHovered ? 19 : 16}
                strokeDashoffset={slice.offset}
                transform={`rotate(-90 ${CENTER} ${CENTER})`}
                initial={shouldReduce ? false : { strokeDasharray: `0 ${slice.circumference}` }}
                animate={{
                  strokeDasharray:
                    shouldReduce || donutInView ? targetDash : `0 ${slice.circumference}`,
                }}
                transition={
                  shouldReduce
                    ? INSTANT_TRANSITION
                    : {
                        duration: 0.68,
                        delay: idx * 0.06,
                        ease: EDITORIAL_EASE,
                      }
                }
                style={{
                  opacity: isHighlighted ? 1 : 0.34,
                  cursor: 'pointer',
                  transition: shouldReduce ? 'none' : 'opacity 150ms ease, stroke-width 150ms ease',
                }}
                tabIndex={0}
                role="button"
                aria-label={`${slice.shortLabel}: ${formatPct(slice.percentual)}, ${formatBRL(slice.total_liquido)}`}
                onMouseEnter={() => setHoveredCat(slice.categoria)}
                onMouseLeave={() => setHoveredCat(null)}
                onFocus={() => setHoveredCat(slice.categoria)}
                onBlur={() => setHoveredCat(null)}
              >
                <title>
                  {slice.shortLabel}: {formatBRL(slice.total_liquido)} ({formatPct(slice.percentual)})
                </title>
              </motion.circle>
            );
          })}
        </svg>

        {activeSlice ? (
          <div className="donut-center-label donut-center-label--refined">
            <strong className="donut-center-pct serif-display tabular">
              {shouldReduce ? (
                formatPct(activeSlice.percentual)
              ) : (
                <AnimatedNumber
                  value={activeSlice.percentual}
                  kind="pct"
                  duration={0.36}
                  animateOnMount={false}
                />
              )}
            </strong>
            <span
              className="donut-center-name"
              style={{ fontSize: centerLabelSize }}
              title={activeSlice.categoria}
            >
              {activeSlice.shortLabel}
            </span>
          </div>
        ) : null}
      </div>

      <div className="hbar-list">
        {topList.map((cat, idx) => {
          const isMatched =
            hoveredCat === cat.categoria ||
            (hoveredCat?.startsWith('Outras (') && idx >= 5);
          const dimmed = hoveredCat !== null && !isMatched;
          const exactPct = Math.max(
            0,
            Math.min(100, (Math.abs(cat.total_liquido) / maxCat) * 100)
          );
          return (
            <div
              key={cat.categoria}
              className={`hbar-row donut-bar-row${isMatched ? ' donut-bar-row--active' : ''}`}
              style={{ opacity: dimmed ? 0.42 : 1 }}
              onMouseEnter={() => setHoveredCat(cat.categoria)}
              onMouseLeave={() => setHoveredCat(null)}
            >
              <div className="hbar-meta">
                <span className="hbar-name donut-bar-label" title={cat.categoria}>
                  <span
                    className="donut-bar-swatch"
                    style={{ backgroundColor: DONUT_PALETTE[idx % DONUT_PALETTE.length] }}
                    aria-hidden="true"
                  />
                  <span>{shortenCategory(cat.categoria)}</span>
                </span>
                <span className="hbar-values tabular">
                  {formatBRLCompact(cat.total_liquido)}{' '}
                  <span className="donut-bar-pct">({formatPct(cat.percentual)})</span>
                </span>
              </div>
              <AnimatedHBar
                key={`${selectedUf}-${selectedAno}-cat-${cat.categoria}`}
                widthPct={Number(exactPct.toFixed(2))}
                delay={shouldReduce ? 0 : idx * 0.04}
                color={DONUT_PALETTE[idx % DONUT_PALETTE.length]}
              />
            </div>
          );
        })}

        {activeSlice ? (
          <div className="donut-active-foot tabular">
            <span>
              <strong>{activeSlice.shortLabel}</strong> · {formatBRL(activeSlice.total_liquido)}
            </span>
            <span className="donut-active-notes">
              {formatInt(activeSlice.qtd_lancamentos)} notas fiscais
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
});
