import { memo, useCallback, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Filter } from 'lucide-react';
import type { CategoriaResumo } from '../types/api';
import { formatBRL, formatBRLCompact, formatInt, formatPct, shortenCategory } from '../utils/format';
import './DeputiesSection.css';

/**
 * Valores mensais oficiais de referência da CEAP por UF (Câmara dos Deputados — Ato da Mesa).
 * A cota é mensal e acumula ao longo do exercício financeiro (referência anual estimada = 12× mensal).
 */
const CEAP_MONTHLY_2025_BY_UF: Record<string, number> = {
  AC: 57359.87,
  AL: 53164.36,
  AP: 55929.26,
  AM: 56151.46,
  BA: 50965.29,
  CE: 54879.34,
  DF: 41612.55,
  ES: 49160.15,
  GO: 46979.73,
  MA: 54537.99,
  MT: 51439.83,
  MS: 52707.93,
  MG: 47645.91,
  PA: 54624.17,
  PB: 54402.48,
  PR: 50807.19,
  PE: 53997.81,
  PI: 53195.84,
  RJ: 47267.41,
  RN: 55198.09,
  RS: 53086.78,
  RO: 56267.9,
  RR: 58474.7,
  SC: 51951.42,
  SP: 48727.46,
  SE: 52248.86,
  TO: 51525.8,
};

// Proporção histórica da tabela 2023–mar/2025 (ex.: DF R$ 36.582,46/mês -> R$ 41.612,55/mês em abr/2025)
const CEAP_PRE_2025_FACTOR = 36582.46 / 41612.55;
const CEAP_FALLBACK_MONTHLY_2025 = 51500;

export const CEAP_WARN_THRESHOLD_PCT = 80;
export const CEAP_HIGH_CONCENTRATION_PCT = 65;

const EDITORIAL_SEGMENT_COLORS = [
  '#B83628', // Terracotta editorial
  '#25201A', // Tinta principal
  '#C86D3B', // Siena queimado
  '#6C6357', // Grafite quente
  '#B5A895', // Pedra newsprint (outras)
] as const;

const METER_SPRING = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 30,
  mass: 0.9,
};

const INSTANT_TRANSITION = { duration: 0 };

export interface CeapCeilingReference {
  ufCode: string;
  monthly: number;
  annual: number;
  isFallback: boolean;
}

export function getEstimatedAnnualCeapCeiling(
  uf: string | null | undefined,
  ano: number
): CeapCeilingReference {
  const code = (uf ?? '').trim().toUpperCase();
  const baseMonthly2025 = CEAP_MONTHLY_2025_BY_UF[code];
  const isFallback = baseMonthly2025 === undefined;
  const rawMonthly = baseMonthly2025 ?? CEAP_FALLBACK_MONTHLY_2025;
  const factor = ano <= 2024 ? CEAP_PRE_2025_FACTOR : 1;
  const monthly = Math.round(rawMonthly * factor * 100) / 100;
  return {
    ufCode: isFallback ? 'BR' : code,
    monthly,
    annual: Math.round(monthly * 12 * 100) / 100,
    isFallback,
  };
}

interface MeterSegment {
  id: string;
  rawCategory?: string;
  label: string;
  fullLabel: string;
  value: number;
  pctOfScale: number;
  pctOfCeiling: number;
  pctOfTotal: number;
  qtdLancamentos?: number;
  color: string;
}

export interface CeapUsageMeterProps {
  variant: 'compact' | 'detailed';
  totalLiquido: number;
  uf: string | null | undefined;
  ano: number;
  categorias?: CategoriaResumo[];
  rank?: number | null;
  totalInSlice?: number | null;
  percentualNoRecorte?: number | null;
  sliceAverage?: number | null;
  onSelectCategory?: (categoria: string | null) => void;
  selectedCategory?: string | null;
}

function buildDetailedSegments(
  categorias: CategoriaResumo[],
  totalLiquido: number,
  ceilingAnnual: number,
  scaleMax: number
): MeterSegment[] {
  const positives = [...categorias]
    .filter((c) => c.total_liquido > 0)
    .sort((a, b) => b.total_liquido - a.total_liquido);

  if (positives.length === 0) return [];

  const maxDirect = 4;
  const top = positives.slice(0, maxDirect);
  const rest = positives.slice(maxDirect);
  const baseTotal = totalLiquido > 0 ? totalLiquido : positives.reduce((acc, c) => acc + c.total_liquido, 0);

  const segments: MeterSegment[] = top.map((c, idx) => ({
    id: c.categoria,
    rawCategory: c.categoria,
    label: shortenCategory(c.categoria),
    fullLabel: c.categoria,
    value: c.total_liquido,
    pctOfScale: scaleMax > 0 ? (c.total_liquido / scaleMax) * 100 : 0,
    pctOfCeiling: ceilingAnnual > 0 ? (c.total_liquido / ceilingAnnual) * 100 : 0,
    pctOfTotal: baseTotal > 0 ? (c.total_liquido / baseTotal) * 100 : c.percentual,
    qtdLancamentos: c.qtd_lancamentos,
    color: EDITORIAL_SEGMENT_COLORS[idx % (EDITORIAL_SEGMENT_COLORS.length - 1)],
  }));

  if (rest.length > 0) {
    let restValue = 0;
    let restCount = 0;
    for (const item of rest) {
      restValue += item.total_liquido;
      restCount += item.qtd_lancamentos;
    }
    if (restValue > 0) {
      segments.push({
        id: '__other_categories__',
        label: `Outras (${rest.length})`,
        fullLabel: `${rest.length} outras categorias CEAP`,
        value: restValue,
        pctOfScale: scaleMax > 0 ? (restValue / scaleMax) * 100 : 0,
        pctOfCeiling: ceilingAnnual > 0 ? (restValue / ceilingAnnual) * 100 : 0,
        pctOfTotal: baseTotal > 0 ? (restValue / baseTotal) * 100 : 0,
        qtdLancamentos: restCount,
        color: EDITORIAL_SEGMENT_COLORS[EDITORIAL_SEGMENT_COLORS.length - 1],
      });
    }
  }

  return segments;
}

function buildCompactSegments(
  totalLiquido: number,
  ceilingAnnual: number,
  sliceAverage: number | null | undefined,
  isCeilingWarn: boolean
): MeterSegment[] {
  const safeVal = Math.max(0, totalLiquido);
  if (safeVal <= 0 || ceilingAnnual <= 0) return [];

  const scaleMax = Math.max(ceilingAnnual, safeVal);
  const avg = sliceAverage && sliceAverage > 0 ? sliceAverage : null;

  if (avg && safeVal > avg) {
    const basePart = avg;
    const excessPart = safeVal - avg;
    return [
      {
        id: 'base-avg',
        label: 'Até a média',
        fullLabel: 'Parcela até a média do recorte',
        value: basePart,
        pctOfScale: (basePart / scaleMax) * 100,
        pctOfCeiling: (basePart / ceilingAnnual) * 100,
        pctOfTotal: (basePart / safeVal) * 100,
        color: '#4B443A',
      },
      {
        id: 'above-avg',
        label: 'Acima da média',
        fullLabel: 'Parcela acima da média do recorte',
        value: excessPart,
        pctOfScale: (excessPart / scaleMax) * 100,
        pctOfCeiling: (excessPart / ceilingAnnual) * 100,
        pctOfTotal: (excessPart / safeVal) * 100,
        color: isCeilingWarn ? '#8F5210' : '#B83628',
      },
    ];
  }

  return [
    {
      id: 'usage-total',
      label: 'Uso CEAP est.',
      fullLabel: 'Consumo líquido frente ao teto anual estimado',
      value: safeVal,
      pctOfScale: (safeVal / scaleMax) * 100,
      pctOfCeiling: (safeVal / ceilingAnnual) * 100,
      pctOfTotal: 100,
      color: isCeilingWarn ? '#8F5210' : '#B83628',
    },
  ];
}

export const CeapUsageMeter = memo(function CeapUsageMeter({
  variant,
  totalLiquido,
  uf,
  ano,
  categorias,
  rank = null,
  totalInSlice = null,
  percentualNoRecorte = null,
  sliceAverage = null,
  onSelectCategory,
  selectedCategory = null,
}: CeapUsageMeterProps) {
  const shouldReduce = useReducedMotion();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const ceiling = useMemo(() => getEstimatedAnnualCeapCeiling(uf, ano), [uf, ano]);

  const safeTotal = Math.max(0, totalLiquido);
  const positiveCatSum = useMemo(() => {
    if (variant !== 'detailed' || !categorias) return 0;
    let sum = 0;
    for (const c of categorias) {
      if (c.total_liquido > 0) sum += c.total_liquido;
    }
    return sum;
  }, [variant, categorias]);
  const utilizationPct = ceiling.annual > 0 ? (safeTotal / ceiling.annual) * 100 : 0;
  const scaleMax =
    variant === 'detailed'
      ? Math.max(ceiling.annual, safeTotal, positiveCatSum, 1)
      : Math.max(ceiling.annual, safeTotal, 1);
  const exceedsCeiling = safeTotal > ceiling.annual;
  const isCeilingWarn = utilizationPct >= CEAP_WARN_THRESHOLD_PCT;

  const segments = useMemo(() => {
    if (variant === 'detailed') {
      return buildDetailedSegments(categorias ?? [], safeTotal, ceiling.annual, scaleMax);
    }
    return buildCompactSegments(safeTotal, ceiling.annual, sliceAverage, isCeilingWarn);
  }, [variant, categorias, safeTotal, ceiling.annual, scaleMax, sliceAverage, isCeilingWarn]);

  const topSegmentConcentration =
    variant === 'detailed' && segments.length > 0 && segments[0].rawCategory
      ? segments[0].pctOfTotal
      : 0;

  const isHighSliceConcentration =
    variant === 'compact' &&
    percentualNoRecorte !== null &&
    totalInSlice !== null &&
    totalInSlice >= 5 &&
    percentualNoRecorte >= 22;

  const isSingleCategoryWarn =
    variant === 'detailed' && topSegmentConcentration >= CEAP_HIGH_CONCENTRATION_PCT;

  const isWarnState = isCeilingWarn || isHighSliceConcentration || isSingleCategoryWarn;

  const activeSegment = useMemo(() => {
    if (hoveredId) {
      return segments.find((s) => s.id === hoveredId) ?? null;
    }
    if (selectedCategory) {
      return segments.find((s) => s.rawCategory === selectedCategory) ?? null;
    }
    return null;
  }, [hoveredId, selectedCategory, segments]);

  const avgMarkerPct =
    sliceAverage && sliceAverage > 0 ? Math.min(99, Math.max(1, (sliceAverage / scaleMax) * 100)) : null;
  const ceilingMarkerPct = exceedsCeiling ? Math.min(98, (ceiling.annual / scaleMax) * 100) : null;

  const handleSegmentLeave = useCallback(() => {
    setHoveredId(null);
  }, []);

  if (variant === 'compact') {
    const warnReason = isCeilingWarn
      ? `≥${CEAP_WARN_THRESHOLD_PCT}% teto`
      : isHighSliceConcentration
        ? 'Alta conc.'
        : null;

    return (
      <div
        className={`ceap-meter ceap-meter--compact ${isWarnState ? 'ceap-meter--warn' : ''}`}
        onMouseLeave={handleSegmentLeave}
      >
        <div className="ceap-meter__compact-head">
          <span
            className="ceap-meter__compact-label"
            title={
              activeSegment
                ? activeSegment.fullLabel
                : `Referência anual estimada CEAP (${ceiling.ufCode}): ${formatBRL(ceiling.annual)}`
            }
          >
            {activeSegment ? activeSegment.label : `Uso CEAP (${ceiling.ufCode})`}
          </span>
          <div className="ceap-meter__compact-right">
            <span className="ceap-meter__pct mono tabular">
              {activeSegment
                ? `${formatPct(activeSegment.pctOfCeiling)}`
                : formatPct(utilizationPct)}
            </span>
            {warnReason ? (
              <span
                className="ceap-meter__alert-pill"
                title={
                  isCeilingWarn
                    ? `Uso líquido atinge ${formatPct(utilizationPct)} da referência anual estimada (${formatBRL(ceiling.annual)})`
                    : `Concentra ${formatPct(percentualNoRecorte ?? 0)} do volume total do recorte`
                }
              >
                <AlertTriangle size={11} aria-hidden="true" />
                {warnReason}
              </span>
            ) : null}
          </div>
        </div>

        <div
          className="ceap-meter__track ceap-meter__track--compact"
          role="group"
          aria-label={`Consumo estimado de ${formatPct(utilizationPct)} do teto anual de referência da CEAP (${formatBRL(ceiling.annual)})`}
        >
          {segments.map((seg, idx) => {
            const isDimmed = hoveredId !== null && hoveredId !== seg.id;
            return (
              <motion.span
                key={seg.id}
                className="ceap-meter__seg"
                tabIndex={0}
                role="button"
                aria-label={`${seg.label}: ${formatBRL(seg.value)} (${formatPct(seg.pctOfCeiling)} do teto estimado)`}
                onMouseEnter={() => setHoveredId(seg.id)}
                onFocus={() => setHoveredId(seg.id)}
                onBlur={handleSegmentLeave}
                initial={shouldReduce ? false : { scaleX: 0 }}
                animate={{
                  scaleX: 1,
                  opacity: isDimmed ? 0.42 : 1,
                }}
                transition={
                  shouldReduce
                    ? INSTANT_TRANSITION
                    : {
                        scaleX: { ...METER_SPRING, delay: idx * 0.04 },
                        opacity: { duration: 0.14 },
                      }
                }
                style={{
                  width: `${Math.max(seg.pctOfScale, 1.5)}%`,
                  backgroundColor: seg.color,
                }}
              />
            );
          })}

          {avgMarkerPct !== null ? (
            <span
              className="ceap-meter__marker"
              style={{ left: `${avgMarkerPct.toFixed(2)}%` }}
              title={`Média do recorte: ${formatBRL(sliceAverage)}`}
              aria-hidden="true"
            />
          ) : null}

          {ceilingMarkerPct !== null ? (
            <span
              className="ceap-meter__marker ceap-meter__marker--ceiling"
              style={{ left: `${ceilingMarkerPct.toFixed(2)}%` }}
              title={`Teto anual est.: ${formatBRL(ceiling.annual)}`}
              aria-hidden="true"
            />
          ) : null}
        </div>

        <div className="ceap-meter__compact-foot tabular">
          <span>
            {activeSegment ? (
              <>
                <strong className="mono">{formatBRL(activeSegment.value)}</strong> ·{' '}
                {formatPct(activeSegment.pctOfTotal)} do dep.
              </>
            ) : (
              <>Teto ref. {formatBRLCompact(ceiling.annual)}</>
            )}
          </span>
          <span>
            {percentualNoRecorte !== null ? `${formatPct(percentualNoRecorte)} do recorte` : null}
          </span>
        </div>
      </div>
    );
  }

  // Detailed variant (DeputyDetailView)
  const remainingRef = Math.max(0, ceiling.annual - safeTotal);

  return (
    <section
      className={`ceap-meter ceap-meter--detailed ${isWarnState ? 'ceap-meter--warn' : ''}`}
      aria-label={`Medidor de uso da cota CEAP em ${ano}`}
      onMouseLeave={handleSegmentLeave}
    >
      <div className="ceap-meter__header">
        <div className="ceap-meter__headline-group">
          <div className="ceap-meter__kicker-row">
            <span className="ceap-meter__kicker">
              Uso da cota CEAP · {ceiling.ufCode}/{ano}
            </span>
            {rank !== null && totalInSlice !== null && totalInSlice > 0 ? (
              <span
                className={`ceap-meter__rank-pill tabular ${rank <= 3 ? 'ceap-meter__rank-pill--top' : ''}`}
              >
                #{rank} de {formatInt(totalInSlice)} no recorte
              </span>
            ) : null}
          </div>

          <div className="ceap-meter__primary-readout">
            <span className="ceap-meter__big-pct serif-display tabular">
              {formatPct(utilizationPct)}
            </span>
            <span className="ceap-meter__ratio mono tabular">
              {formatBRL(safeTotal)} <span className="ceap-meter__slash">/</span>{' '}
              {formatBRL(ceiling.annual)}
            </span>
          </div>
        </div>

        <div className="ceap-meter__status-col">
          {isCeilingWarn ? (
            <span className="ceap-meter__status-badge ceap-meter__status-badge--warn">
              <AlertTriangle size={14} aria-hidden="true" />
              {exceedsCeiling
                ? 'Acima do teto anual de referência'
                : `Acima de ${CEAP_WARN_THRESHOLD_PCT}% do teto anual de referência`}
            </span>
          ) : isSingleCategoryWarn ? (
            <span className="ceap-meter__status-badge ceap-meter__status-badge--warn">
              <AlertTriangle size={14} aria-hidden="true" />
              Concentração: {formatPct(topSegmentConcentration)} em 1 rubrica
            </span>
          ) : (
            <span className="ceap-meter__status-badge ceap-meter__status-badge--ok">
              <CheckCircle2 size={14} aria-hidden="true" />
              Dentro da referência anual est.
            </span>
          )}

          {sliceAverage && sliceAverage > 0 ? (
            <span className="ceap-meter__peer-compare tabular">
              Média no recorte: <strong className="mono">{formatBRL(sliceAverage)}</strong>
              {percentualNoRecorte !== null ? ` · ${formatPct(percentualNoRecorte)} da bancada` : ''}
            </span>
          ) : null}
        </div>
      </div>

      {/* Multi-segmented continuous bar */}
      <div className="ceap-meter__track-wrap">
        <div
          className="ceap-meter__track ceap-meter__track--detailed"
          role="group"
          aria-label="Distribuição por categoria frente ao teto anual estimado da CEAP"
        >
          {segments.length === 0 ? (
            <span className="ceap-meter__empty-bar">Sem despesas positivas registradas no ano</span>
          ) : (
            segments.map((seg, idx) => {
              const isHighlighted = activeSegment?.id === seg.id;
              const isDimmed = activeSegment !== null && !isHighlighted;
              const isClickable = Boolean(onSelectCategory && seg.rawCategory);

              return (
                <motion.button
                  key={seg.id}
                  type="button"
                  className={`ceap-meter__seg ceap-meter__seg--interactive ${
                    isHighlighted ? 'ceap-meter__seg--active' : ''
                  }`}
                  onMouseEnter={() => setHoveredId(seg.id)}
                  onFocus={() => setHoveredId(seg.id)}
                  onBlur={handleSegmentLeave}
                  onClick={() => {
                    if (!onSelectCategory || !seg.rawCategory) return;
                    onSelectCategory(selectedCategory === seg.rawCategory ? null : seg.rawCategory);
                  }}
                  aria-label={`${seg.label}: ${formatBRL(seg.value)}, ${formatPct(seg.pctOfCeiling)} do teto anual estimado`}
                  aria-pressed={isClickable ? selectedCategory === seg.rawCategory : undefined}
                  initial={shouldReduce ? false : { scaleX: 0 }}
                  animate={{
                    scaleX: 1,
                    opacity: isDimmed ? 0.42 : 1,
                  }}
                  transition={
                    shouldReduce
                      ? INSTANT_TRANSITION
                      : {
                          scaleX: { ...METER_SPRING, delay: idx * 0.045 },
                          opacity: { duration: 0.15 },
                        }
                  }
                  style={{
                    width: `${Math.max(seg.pctOfScale, 1.2)}%`,
                    backgroundColor: seg.color,
                    cursor: isClickable ? 'pointer' : 'default',
                  }}
                />
              );
            })
          )}

          {avgMarkerPct !== null ? (
            <span
              className="ceap-meter__marker ceap-meter__marker--detailed"
              style={{ left: `${avgMarkerPct.toFixed(2)}%` }}
              title={`Média por deputado no recorte: ${formatBRL(sliceAverage)}`}
              aria-hidden="true"
            />
          ) : null}

          {ceilingMarkerPct !== null ? (
            <span
              className="ceap-meter__marker ceap-meter__marker--ceiling ceap-meter__marker--detailed"
              style={{ left: `${ceilingMarkerPct.toFixed(2)}%` }}
              title={`100% da referência anual estimada (${formatBRL(ceiling.annual)})`}
              aria-hidden="true"
            />
          ) : null}
        </div>

        <div className="ceap-meter__scale-labels mono tabular">
          <span>R$ 0</span>
          {sliceAverage && sliceAverage > 0 ? (
            <span>Média recorte: {formatBRLCompact(sliceAverage)}</span>
          ) : null}
          <span>
            Ref. 100%: {formatBRLCompact(ceiling.annual)}
            {exceedsCeiling ? ` (uso ${formatPct(utilizationPct)})` : ''}
          </span>
        </div>
      </div>

      {/* Fixed-height live readout bar (prevents CLS on hover/focus) */}
      <div className="ceap-meter__readout" aria-live="polite">
        {activeSegment ? (
          <div className="ceap-meter__readout-active">
            <span className="ceap-meter__readout-title">
              <span
                className="ceap-meter__swatch"
                style={{ backgroundColor: activeSegment.color }}
                aria-hidden="true"
              />
              <strong>{activeSegment.label}</strong>
              {activeSegment.qtdLancamentos !== undefined ? (
                <span className="ceap-meter__readout-muted">
                  ({formatInt(activeSegment.qtdLancamentos)} lanç.)
                </span>
              ) : null}
            </span>
            <span className="ceap-meter__readout-vals mono tabular">
              <strong>{formatBRL(activeSegment.value)}</strong> · {formatPct(activeSegment.pctOfTotal)} do
              gasto · {formatPct(activeSegment.pctOfCeiling)} do teto est.
            </span>
          </div>
        ) : (
          <div className="ceap-meter__readout-idle">
            <span>
              Passe o cursor ou navegue pelos segmentos para inspecionar cada rubrica.
              {onSelectCategory ? ' Clique em uma categoria para filtrar os lançamentos abaixo.' : ''}
            </span>
            <span className="mono tabular">
              {exceedsCeiling
                ? `Excedente sobre ref.: +${formatBRL(safeTotal - ceiling.annual)}`
                : `Margem est. disponível: ${formatBRL(remainingRef)}`}
            </span>
          </div>
        )}
      </div>

      {/* Interactive segment legend */}
      {segments.length > 0 ? (
        <div className="ceap-meter__legend" role="list" aria-label="Legenda interativa por categoria">
          {segments.map((seg) => {
            const isHighlighted = activeSegment?.id === seg.id;
            const isFilterSelected = Boolean(seg.rawCategory && selectedCategory === seg.rawCategory);
            const canFilter = Boolean(onSelectCategory && seg.rawCategory);

            return (
              <button
                key={seg.id}
                type="button"
                role="listitem"
                className={`ceap-meter__legend-chip ${
                  isHighlighted ? 'ceap-meter__legend-chip--active' : ''
                } ${isFilterSelected ? 'ceap-meter__legend-chip--selected' : ''}`}
                onMouseEnter={() => setHoveredId(seg.id)}
                onFocus={() => setHoveredId(seg.id)}
                onBlur={handleSegmentLeave}
                onClick={() => {
                  if (!onSelectCategory || !seg.rawCategory) return;
                  onSelectCategory(isFilterSelected ? null : seg.rawCategory);
                }}
                aria-pressed={canFilter ? isFilterSelected : undefined}
              >
                <span
                  className="ceap-meter__swatch"
                  style={{ backgroundColor: seg.color }}
                  aria-hidden="true"
                />
                <span className="ceap-meter__legend-name">{seg.label}</span>
                <span className="ceap-meter__legend-val mono tabular">
                  {formatPct(seg.pctOfCeiling)}
                </span>
                {isFilterSelected ? <Filter size={11} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <p className="ceap-meter__footnote">
        Referência anual estimada: 12× cota mensal oficial CEAP/{ceiling.ufCode} (
        <span className="mono tabular">{formatBRL(ceiling.monthly)}/mês</span> ·{' '}
        <span className="mono tabular">{formatBRL(ceiling.annual)}/ano</span>). O saldo mensal é
        cumulativo no exercício e despesas negativas representam estornos/créditos.
      </p>
    </section>
  );
});
