import { useId, useMemo, useRef, useState } from 'react';
import { motion, useInView } from 'motion/react';
import { ExternalLink, Info } from 'lucide-react';
import type { AnalyticsResponse, DeputadoComparacaoOut } from '../types/api';
import {
  formatBRL,
  formatBRLCompact,
  formatInt,
  formatPct,
  getMonthLabel,
  shortenCategory,
} from '../utils/format';
import { AnimatedContent } from './motion/AnimatedContent';
import { AnimatedHBar } from './motion/InViewBar';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { MethodPopover } from './motion/MethodPopover';

interface AnalyticsSectionProps {
  analytics: AnalyticsResponse | null;
  loading: boolean;
  selectedUf: string;
  selectedAno: number;
  onSelectUf: (uf: string) => void;
  onOpenDeputy: (id: number) => void;
}

const CONTRA_EASE: [number, number, number, number] = [0.48, 0.05, 0.35, 0.99];
const DONUT_PALETTE = ['#B83628', '#25201A', '#D16D43', '#6C6357', '#9F8E77', '#C9BEA9'];

interface TabOption<T extends string> {
  id: T;
  label: string;
}

function SegmentedTabs<T extends string>({
  groupId,
  value,
  options,
  label,
  onChange,
}: {
  groupId: string;
  value: T;
  options: TabOption<T>[];
  label: string;
  onChange: (next: T) => void;
}) {
  return (
    <div className="segmented-tabs" role="group" aria-label={label}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            className="segmented-tab-btn"
            aria-pressed={active}
            onClick={() => onChange(opt.id)}
          >
            {active && (
              <motion.span
                layoutId={groupId}
                className="segmented-tab-pill"
                transition={{ duration: 0.24, ease: CONTRA_EASE }}
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function buildSmoothCurvePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = ((p0.x + p1.x) / 2).toFixed(1);
    d += ` C ${midX} ${p0.y.toFixed(1)}, ${midX} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

function deterministicJitter(id: number, idx: number): number {
  const seed = Math.sin(id * 12.9898 + idx * 78.233) * 43758.5453;
  const frac = seed - Math.floor(seed);
  return (frac - 0.5) * 96;
}

interface DonutSlice {
  categoria: string;
  total_liquido: number;
  percentual: number;
  qtd_lancamentos: number;
  color: string;
  circumference: number;
  arc: number;
  offset: number;
}

function CategoryDonutGraphic({
  selectedUf,
  selectedAno,
  donutSlices,
  hoveredCat,
  activeDonutSlice,
  onHoverCat,
}: {
  selectedUf: string;
  selectedAno: number;
  donutSlices: DonutSlice[];
  hoveredCat: string | null;
  activeDonutSlice: DonutSlice | null;
  onHoverCat: (cat: string | null) => void;
}) {
  const donutRef = useRef<HTMLDivElement>(null);
  const donutInView = useInView(donutRef, { once: true, amount: 0.1 });

  return (
    <div
      ref={donutRef}
      className="donut-wrap"
      aria-label="Participação percentual das categorias"
    >
      <svg viewBox="0 0 132 132" width="138" height="138" role="img">
        <circle
          cx="66"
          cy="66"
          r="50"
          fill="none"
          stroke="var(--bg-inset)"
          strokeWidth="15"
        />
        {donutSlices.map((slice, idx) => {
          const isHighlighted = hoveredCat === null || hoveredCat === slice.categoria;
          return (
            <motion.circle
              key={`${selectedUf}-${selectedAno}-${slice.categoria}`}
              cx="66"
              cy="66"
              r="50"
              fill="none"
              stroke={slice.color}
              strokeWidth={hoveredCat === slice.categoria ? 18 : 15}
              strokeDashoffset={slice.offset}
              transform="rotate(-90 66 66)"
              initial={{ strokeDasharray: `0 ${slice.circumference}` }}
              animate={{
                strokeDasharray: donutInView
                  ? `${Math.max(0, slice.arc - 1.5)} ${slice.circumference}`
                  : `0 ${slice.circumference}`,
              }}
              transition={{
                duration: 0.72,
                delay: idx * 0.07,
                ease: CONTRA_EASE,
              }}
              style={{
                opacity: isHighlighted ? 1 : 0.34,
                cursor: 'pointer',
                transition: 'opacity 150ms ease, stroke-width 150ms ease',
              }}
              onMouseEnter={() => onHoverCat(slice.categoria)}
              onMouseLeave={() => onHoverCat(null)}
            />
          );
        })}
      </svg>
      {activeDonutSlice && (
        <div className="donut-center-label">
          <strong
            className="serif-display tabular"
            style={{ fontSize: '1.16rem', lineHeight: 1.05, color: 'var(--ink-primary)' }}
          >
            <AnimatedNumber value={activeDonutSlice.percentual} kind="pct" duration={0.5} />
          </strong>
          <span
            style={{
              fontSize: '0.66rem',
              color: 'var(--ink-muted)',
              maxWidth: '9ch',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={activeDonutSlice.categoria}
          >
            {shortenCategory(activeDonutSlice.categoria)}
          </span>
        </div>
      )}
    </div>
  );
}

interface MonthlyPoint {
  mes: number;
  mes_nome: string;
  total_liquido: number;
  qtd_lancamentos: number;
  qtd_deputados_ativos: number;
  x: number;
  y: number;
}

function MonthlyEvolutionGraphic({
  uid,
  selectedUf,
  selectedAno,
  mesView,
  monthlyPoints,
  areaLinePath,
  areaFillPath,
  maxMes,
  avgMes,
  avgY,
  hoveredMes,
  hoveredMonthObj,
  onHoverMes,
}: {
  uid: string;
  selectedUf: string;
  selectedAno: number;
  mesView: 'grafico' | 'tabela';
  monthlyPoints: MonthlyPoint[];
  areaLinePath: string;
  areaFillPath: string;
  maxMes: number;
  avgMes: number;
  avgY: number;
  hoveredMes: number | null;
  hoveredMonthObj: MonthlyPoint | null;
  onHoverMes: (mes: number | null) => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const areaInView = useInView(areaRef, { once: true, amount: 0.1 });

  return (
    <div ref={areaRef}>
      <svg
        viewBox="0 0 600 192"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label={`Série mensal contínua de despesas em ${selectedUf} em ${selectedAno}`}
      >
        <defs>
          <linearGradient id={`area-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B83628" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#B83628" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((frac) => {
          const y = 154 - frac * (154 - 22);
          return (
            <g key={frac}>
              <line
                x1={50}
                y1={y}
                x2={582}
                y2={y}
                stroke="rgba(37, 32, 26, 0.1)"
                strokeDasharray="2 3"
              />
              <text
                x={44}
                y={y + 3.5}
                textAnchor="end"
                fill="#6C6357"
                fontSize="10"
              >
                {Math.round((maxMes * frac) / 1000)}k
              </text>
            </g>
          );
        })}

        {/* Linha AVG */}
        {avgMes > 0 && (
          <g>
            <line
              x1={50}
              y1={avgY}
              x2={582}
              y2={avgY}
              stroke="rgba(37, 32, 26, 0.45)"
              strokeDasharray="4 4"
              strokeWidth="1.2"
            />
            <rect
              x={544}
              y={Math.max(4, avgY - 17)}
              width={38}
              height={14}
              rx={3}
              fill="#FAF7F0"
              stroke="rgba(37, 32, 26, 0.36)"
              strokeWidth="1"
            />
            <text
              x={563}
              y={Math.max(14, avgY - 7)}
              textAnchor="middle"
              fill="#25201A"
              fontSize="9"
              fontWeight="700"
            >
              AVG
            </text>
          </g>
        )}

        {/* Área e linha contínuas animadas com ref já montado */}
        <g>
          {areaFillPath && (
            <motion.path
              key={`fill-${selectedUf}-${selectedAno}-${mesView}`}
              d={areaFillPath}
              fill={`url(#area-grad-${uid})`}
              initial={{ opacity: 0 }}
              animate={{ opacity: areaInView ? 1 : 0 }}
              transition={{ duration: 0.65, delay: 0.22, ease: CONTRA_EASE }}
            />
          )}
          {areaLinePath && (
            <motion.path
              key={`line-${selectedUf}-${selectedAno}-${mesView}`}
              d={areaLinePath}
              fill="none"
              stroke="#B83628"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0.4 }}
              animate={{
                pathLength: areaInView ? 1 : 0,
                opacity: areaInView ? 1 : 0.4,
              }}
              transition={{ duration: 0.92, ease: CONTRA_EASE }}
            />
          )}
        </g>

        {/* Crosshair vertical no hover */}
        {hoveredMonthObj && (
          <line
            x1={hoveredMonthObj.x}
            y1={16}
            x2={hoveredMonthObj.x}
            y2={154}
            stroke="rgba(37, 32, 26, 0.3)"
            strokeWidth="1"
          />
        )}

        {/* Nós interativos e eixo X */}
        {monthlyPoints.map((pt) => {
          const active = hoveredMes === pt.mes;
          const hasEntries = pt.qtd_lancamentos > 0;
          return (
            <g
              key={pt.mes}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHoverMes(pt.mes)}
              onClick={() => onHoverMes(active ? null : pt.mes)}
            >
              <rect x={pt.x - 20} y={10} width={40} height={154} fill="transparent" />
              {hasEntries && (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={active ? 5.5 : 3.5}
                  fill={active ? '#CE4233' : '#FAF7F0'}
                  stroke={active ? '#25201A' : '#B83628'}
                  strokeWidth={2}
                />
              )}
              <text
                x={pt.x}
                y={176}
                textAnchor="middle"
                fill={active ? '#25201A' : '#6C6357'}
                fontWeight={active ? 700 : 500}
                fontSize="11"
              >
                {pt.mes_nome}
              </text>
            </g>
          );
        })}
      </svg>

      <div
        className="tabular"
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: 8,
          fontSize: '0.82rem',
          color: 'var(--ink-secondary)',
        }}
      >
        {hoveredMonthObj ? (
          <>
            <span>
              <strong>
                {getMonthLabel(hoveredMonthObj.mes)}/{selectedAno}
              </strong>
              : {formatBRL(hoveredMonthObj.total_liquido)}
            </span>
            <span style={{ color: 'var(--ink-muted)' }}>
              {formatInt(hoveredMonthObj.qtd_lancamentos)} notas ·{' '}
              {formatInt(hoveredMonthObj.qtd_deputados_ativos)} dep. ativos
            </span>
          </>
        ) : (
          <>
            <span>Passe ou clique em qualquer mês para inspecionar a série.</span>
            <span style={{ color: 'var(--ink-muted)' }}>Média mensal: {formatBRL(avgMes)}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function AnalyticsSection({
  analytics,
  loading,
  selectedUf,
  selectedAno,
  onSelectUf,
  onOpenDeputy,
}: AnalyticsSectionProps) {
  const uid = useId().replace(/:/g, '');

  const [catView, setCatView] = useState<'grafico' | 'tabela'>('grafico');
  const [mesView, setMesView] = useState<'grafico' | 'tabela'>('grafico');
  const [depView, setDepView] = useState<'barras' | 'dispersao' | 'tabela'>('barras');
  const [ufView, setUfView] = useState<'grafico' | 'tabela'>('grafico');

  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
  const [hoveredMes, setHoveredMes] = useState<number | null>(null);
  const [hoveredDep, setHoveredDep] = useState<DeputadoComparacaoOut | null>(null);
  const [hoveredUf, setHoveredUf] = useState<string | null>(null);

  const maxCat = useMemo(
    () => Math.max(...(analytics?.por_categoria ?? []).map((c) => Math.abs(c.total_liquido)), 1),
    [analytics]
  );

  const donutSlices = useMemo(() => {
    const list = analytics?.por_categoria ?? [];
    if (list.length === 0) return [];
    const top = list.slice(0, 5);
    const rest = list.slice(5);
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

    const totalPos = Math.max(
      combined.reduce((acc, s) => acc + Math.max(0, s.total_liquido), 0),
      1
    );
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    let offsetAcc = 0;

    return combined.map((slice, idx) => {
      const share = Math.max(0, slice.total_liquido) / totalPos;
      const arc = share * circumference;
      const offset = -offsetAcc;
      offsetAcc += arc;
      return {
        ...slice,
        color: DONUT_PALETTE[idx % DONUT_PALETTE.length],
        circumference,
        arc,
        offset,
      };
    });
  }, [analytics]);

  const activeDonutSlice = useMemo(() => {
    if (donutSlices.length === 0) return null;
    if (hoveredCat) {
      return donutSlices.find((s) => s.categoria === hoveredCat) ?? donutSlices[0];
    }
    return donutSlices[0];
  }, [donutSlices, hoveredCat]);

  const monthlySeries = analytics?.evolucao_mensal ?? [];
  const maxMes = useMemo(
    () => Math.max(...monthlySeries.map((m) => Math.abs(m.total_liquido)), 1),
    [monthlySeries]
  );

  const avgMes = useMemo(() => {
    const active = monthlySeries.filter((m) => m.qtd_lancamentos > 0);
    if (active.length === 0) return 0;
    return active.reduce((acc, m) => acc + m.total_liquido, 0) / active.length;
  }, [monthlySeries]);

  const monthlyPoints = useMemo(() => {
    const plotLeft = 56;
    const plotRight = 578;
    const plotTop = 22;
    const plotBottom = 154;
    const plotH = plotBottom - plotTop;

    return monthlySeries.map((m, idx) => {
      const x = plotLeft + (idx / 11) * (plotRight - plotLeft);
      const val = Math.max(0, m.total_liquido);
      const y = plotBottom - (val / maxMes) * plotH;
      return { ...m, x, y };
    });
  }, [monthlySeries, maxMes]);

  const areaLinePath = useMemo(() => buildSmoothCurvePath(monthlyPoints), [monthlyPoints]);
  const areaFillPath = useMemo(() => {
    if (monthlyPoints.length === 0) return '';
    const first = monthlyPoints[0];
    const last = monthlyPoints[monthlyPoints.length - 1];
    return `${areaLinePath} L ${last.x.toFixed(1)} 154 L ${first.x.toFixed(1)} 154 Z`;
  }, [areaLinePath, monthlyPoints]);

  const avgY = 154 - (Math.max(0, avgMes) / maxMes) * (154 - 22);

  const hoveredMonthObj = useMemo(() => {
    if (hoveredMes === null) return null;
    return monthlyPoints.find((m) => m.mes === hoveredMes) ?? null;
  }, [monthlyPoints, hoveredMes]);

  const deputadosList = analytics?.comparacao_parlamentares ?? [];
  const maxDep = useMemo(
    () => Math.max(...deputadosList.map((d) => Math.abs(d.total_liquido)), 1),
    [deputadosList]
  );

  const medianDep = useMemo(() => {
    if (deputadosList.length === 0) return 0;
    const sorted = [...deputadosList].map((d) => d.total_liquido).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }, [deputadosList]);

  const maxUfAvg = useMemo(
    () =>
      Math.max(...(analytics?.distribuicao_ufs ?? []).map((u) => Math.abs(u.media_por_deputado)), 1),
    [analytics]
  );

  return (
    <section id="analises" className="page-section page-section--alt">
      <div className="container">
        <div className="section-header">
          <div>
            <h2 className="section-title">Análises comparativas e séries</h2>
            <p className="section-subtitle">
              Visualizações contextualizadas com período, recorte, unidade monetária (R$ BRL),
              alternativa em tabela e nota metodológica sobre comparabilidade.
            </p>
          </div>
        </div>

        {loading && !analytics ? (
          <div className="analytics-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="chart-card">
                <div className="skeleton-block" style={{ height: 240, width: '100%' }} />
              </div>
            ))}
          </div>
        ) : (
          <AnimatedContent>
            <div className="analytics-grid">
              {/* Gráfico 1: Categorias (Donut Animado + Barras Horizontais) */}
              <article className="chart-card">
                <div>
                  <div className="chart-card-header">
                    <div>
                      <h3 className="chart-card-title">Composição por categoria</h3>
                      <p className="chart-card-sub">
                        Recorte: {selectedUf} · Período: {selectedAno} · Unidade: R$ (BRL)
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SegmentedTabs
                        groupId="cat-tabs"
                        value={catView}
                        label="Alternar visualização de categorias"
                        options={[
                          { id: 'grafico', label: 'Gráfico' },
                          { id: 'tabela', label: 'Tabela' },
                        ]}
                        onChange={setCatView}
                      />
                      <MethodPopover
                        title="Participação por categoria"
                        body="O anel agrupa as 5 maiores rubricas da cota parlamentar e soma as demais em Outras. Passe o cursor nas barras ou fatias para inspecionar cada parcela."
                        sourceLabel="CEAP · tipoDespesa"
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    {!analytics?.has_data ? (
                      <p style={{ color: 'var(--ink-muted)' }}>
                        Sem dados coletados para {selectedUf}/{selectedAno}.
                      </p>
                    ) : catView === 'grafico' ? (
                      <div className="donut-split">
                        <CategoryDonutGraphic
                          selectedUf={selectedUf}
                          selectedAno={selectedAno}
                          donutSlices={donutSlices}
                          hoveredCat={hoveredCat}
                          activeDonutSlice={activeDonutSlice}
                          onHoverCat={setHoveredCat}
                        />

                        <div className="hbar-list">
                          {analytics.por_categoria.slice(0, 6).map((cat, idx) => {
                            const dimmed = hoveredCat !== null && hoveredCat !== cat.categoria;
                            return (
                              <div
                                key={cat.categoria}
                                className="hbar-row"
                                style={{ opacity: dimmed ? 0.42 : 1, transition: 'opacity 150ms ease' }}
                                onMouseEnter={() => setHoveredCat(cat.categoria)}
                                onMouseLeave={() => setHoveredCat(null)}
                              >
                                <div className="hbar-meta">
                                  <span className="hbar-name" title={cat.categoria}>
                                    {shortenCategory(cat.categoria)}
                                  </span>
                                  <span className="hbar-values tabular">
                                    {formatBRLCompact(cat.total_liquido)} ({formatPct(cat.percentual)})
                                  </span>
                                </div>
                                <AnimatedHBar
                                  key={`${selectedUf}-${selectedAno}-cat-${cat.categoria}`}
                                  widthPct={Math.max(
                                    3,
                                    Math.round((Math.abs(cat.total_liquido) / maxCat) * 100)
                                  )}
                                  delay={idx * 0.045}
                                  color={DONUT_PALETTE[idx % DONUT_PALETTE.length]}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="table-scroll" style={{ maxHeight: 280 }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Categoria</th>
                              <th className="num-col">Notas</th>
                              <th className="num-col">Total (R$)</th>
                              <th className="num-col">%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analytics.por_categoria.map((cat) => (
                              <tr key={cat.categoria}>
                                <td>{cat.categoria}</td>
                                <td className="num-col">{formatInt(cat.qtd_lancamentos)}</td>
                                <td className="num-col">{formatBRL(cat.total_liquido)}</td>
                                <td className="num-col">{formatPct(cat.percentual)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div className="chart-footer-meta">
                  <span>Fonte: Câmara dos Deputados · CEAP</span>
                  <span>Total no recorte: {formatBRL(analytics?.total_liquido ?? 0)}</span>
                </div>
              </article>

              {/* Gráfico 2: Evolução mensal (SVG Smooth Area + Clip-Path Reveal + AVG line) */}
              <article className="chart-card">
                <div>
                  <div className="chart-card-header">
                    <div>
                      <h3 className="chart-card-title">Evolução mensal das despesas</h3>
                      <p className="chart-card-sub">
                        Recorte: {selectedUf} · Período: Jan–Dez {selectedAno} · Unidade: R$ (BRL)
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SegmentedTabs
                        groupId="mes-tabs"
                        value={mesView}
                        label="Alternar visualização mensal"
                        options={[
                          { id: 'grafico', label: 'Gráfico' },
                          { id: 'tabela', label: 'Tabela' },
                        ]}
                        onChange={setMesView}
                      />
                      <MethodPopover
                        title="Curva de competência mensal"
                        body="Cada ponto agrega o valor líquido das notas emitidas no mês correspondente, comparado à linha pontilhada de média dos meses ativos (AVG)."
                        sourceLabel="numMes / numAno · CEAP"
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    {!analytics?.has_data ? (
                      <p style={{ color: 'var(--ink-muted)' }}>
                        Sem série mensal carregada para {selectedUf}/{selectedAno}.
                      </p>
                    ) : mesView === 'grafico' ? (
                      <MonthlyEvolutionGraphic
                        uid={uid}
                        selectedUf={selectedUf}
                        selectedAno={selectedAno}
                        mesView={mesView}
                        monthlyPoints={monthlyPoints}
                        areaLinePath={areaLinePath}
                        areaFillPath={areaFillPath}
                        maxMes={maxMes}
                        avgMes={avgMes}
                        avgY={avgY}
                        hoveredMes={hoveredMes}
                        hoveredMonthObj={hoveredMonthObj}
                        onHoverMes={setHoveredMes}
                      />
                    ) : (
                      <div className="table-scroll" style={{ maxHeight: 280 }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Mês</th>
                              <th className="num-col">Dep. ativos</th>
                              <th className="num-col">Lançamentos</th>
                              <th className="num-col">Total líquido</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analytics.evolucao_mensal.map((m) => (
                              <tr key={m.mes}>
                                <td>{getMonthLabel(m.mes)}</td>
                                <td className="num-col">{formatInt(m.qtd_deputados_ativos)}</td>
                                <td className="num-col">{formatInt(m.qtd_lancamentos)}</td>
                                <td className="num-col">{formatBRL(m.total_liquido)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div className="chart-footer-meta">
                  <span>Fonte: Câmara dos Deputados · CEAP</span>
                  <span>Unidade: R$ por mês de competência</span>
                </div>
              </article>

              {/* Gráfico 3: Parlamentares (Barras | Dispersão Bee-Swarm | Tabela) */}
              <article className="chart-card">
                <div>
                  <div className="chart-card-header">
                    <div>
                      <h3 className="chart-card-title">Volume registrado por parlamentar</h3>
                      <p className="chart-card-sub">
                        Recorte: {selectedUf} ({selectedAno}) · Comparação descritiva em R$
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SegmentedTabs
                        groupId="dep-tabs"
                        value={depView}
                        label="Alternar visualização por parlamentar"
                        options={[
                          { id: 'barras', label: 'Barras' },
                          { id: 'dispersao', label: 'Dispersão' },
                          { id: 'tabela', label: 'Tabela' },
                        ]}
                        onChange={setDepView}
                      />
                      <MethodPopover
                        title="Comparação entre parlamentares"
                        body="O modo Dispersão posiciona cada deputado pelo total líquido contra a linha de mediana do estado (MED). Clique em qualquer ponto ou nome para abrir o dossiê completo."
                        sourceLabel="CEAP · Deputados ativos"
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    {!analytics?.has_data ? (
                      <p style={{ color: 'var(--ink-muted)' }}>
                        Nenhum parlamentar disponível para {selectedUf}/{selectedAno}.
                      </p>
                    ) : depView === 'barras' ? (
                      <div className="hbar-list">
                        {deputadosList.slice(0, 8).map((dep, idx) => {
                          const dimmed = hoveredDep !== null && hoveredDep.deputado_id !== dep.deputado_id;
                          return (
                            <div
                              key={dep.deputado_id}
                              className="hbar-row"
                              style={{ opacity: dimmed ? 0.42 : 1, transition: 'opacity 150ms ease' }}
                              onMouseEnter={() => setHoveredDep(dep)}
                              onMouseLeave={() => setHoveredDep(null)}
                            >
                              <div className="hbar-meta">
                                <button
                                  type="button"
                                  onClick={() => onOpenDeputy(dep.deputado_id)}
                                  style={{
                                    background: 'transparent',
                                    border: 0,
                                    padding: 0,
                                    color: 'var(--ink-primary)',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={`Abrir perfil de ${dep.nome_parlamentar}`}
                                >
                                  {dep.nome_parlamentar} ({dep.partido ?? 'S/P'})
                                </button>
                                <span className="hbar-values tabular">
                                  {formatBRLCompact(dep.total_liquido)} · {formatInt(dep.qtd_despesas)} notas
                                </span>
                              </div>
                              <AnimatedHBar
                                key={`${selectedUf}-${selectedAno}-dep-${dep.deputado_id}`}
                                widthPct={Math.max(
                                  3,
                                  Math.round((Math.abs(dep.total_liquido) / maxDep) * 100)
                                )}
                                delay={idx * 0.04}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : depView === 'dispersao' ? (
                      <div>
                        <svg
                          viewBox="0 0 600 186"
                          style={{ width: '100%', height: 'auto', display: 'block' }}
                          role="img"
                          aria-label={`Dispersão de despesas dos parlamentares de ${selectedUf} em ${selectedAno}`}
                        >
                          {/* Eixo X e grid */}
                          <line x1={32} y1={154} x2={576} y2={154} stroke="rgba(37, 32, 26, 0.22)" />
                          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                            const x = 32 + frac * (576 - 32);
                            return (
                              <g key={frac}>
                                <line
                                  x1={x}
                                  y1={22}
                                  x2={x}
                                  y2={154}
                                  stroke="rgba(37, 32, 26, 0.08)"
                                  strokeDasharray="2 3"
                                />
                                <text x={x} y={172} textAnchor="middle" fill="#6C6357" fontSize="10">
                                  {formatBRLCompact(maxDep * frac)}
                                </text>
                              </g>
                            );
                          })}

                          {/* Linha de Mediana */}
                          {medianDep > 0 && (
                            <g>
                              <line
                                x1={32 + (medianDep / maxDep) * (576 - 32)}
                                y1={18}
                                x2={32 + (medianDep / maxDep) * (576 - 32)}
                                y2={154}
                                stroke="rgba(37, 32, 26, 0.55)"
                                strokeDasharray="4 4"
                                strokeWidth="1.2"
                              />
                              <rect
                                x={Math.min(525, 32 + (medianDep / maxDep) * (576 - 32) - 18)}
                                y={4}
                                width={36}
                                height={14}
                                rx={3}
                                fill="#25201A"
                              />
                              <text
                                x={Math.min(543, 32 + (medianDep / maxDep) * (576 - 32))}
                                y={14}
                                textAnchor="middle"
                                fill="#FAF7F0"
                                fontSize="9"
                                fontWeight="700"
                              >
                                MED
                              </text>
                            </g>
                          )}

                          {deputadosList.map((dep, idx) => {
                            const cx = 32 + (Math.max(0, dep.total_liquido) / maxDep) * (576 - 32);
                            const cy = 88 + deterministicJitter(dep.deputado_id, idx);
                            const isHovered = hoveredDep?.deputado_id === dep.deputado_id;
                            const isDimmed = hoveredDep !== null && !isHovered;
                            return (
                              <motion.circle
                                key={dep.deputado_id}
                                cx={cx}
                                cy={cy}
                                r={isHovered ? 10 : 7}
                                fill={isHovered ? '#CE4233' : '#B83628'}
                                stroke="#FAF7F0"
                                strokeWidth={isHovered ? 2.2 : 1.5}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: isDimmed ? 0.34 : 0.92 }}
                                transition={{
                                  duration: 0.36,
                                  delay: idx * 0.025,
                                  ease: CONTRA_EASE,
                                }}
                                style={{ cursor: 'pointer', transformOrigin: `${cx}px ${cy}px` }}
                                onMouseEnter={() => setHoveredDep(dep)}
                                onMouseLeave={() => setHoveredDep(null)}
                                onClick={() => onOpenDeputy(dep.deputado_id)}
                              >
                                <title>
                                  {dep.nome_parlamentar} ({dep.partido ?? 'S/P'}): {formatBRL(dep.total_liquido)}
                                </title>
                              </motion.circle>
                            );
                          })}
                        </svg>

                        <div
                          className="tabular"
                          style={{
                            marginTop: 8,
                            paddingTop: 8,
                            borderTop: '1px solid var(--border-subtle)',
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'space-between',
                            gap: 8,
                            fontSize: '0.82rem',
                            color: 'var(--ink-secondary)',
                          }}
                        >
                          {hoveredDep ? (
                            <>
                              <span>
                                <strong>{hoveredDep.nome_parlamentar}</strong> ({hoveredDep.partido ?? 'S/P'}) ·{' '}
                                {formatBRL(hoveredDep.total_liquido)}
                              </span>
                              <span style={{ color: 'var(--ink-muted)' }}>
                                {formatInt(hoveredDep.qtd_despesas)} notas · Clique no ponto para abrir o perfil
                              </span>
                            </>
                          ) : (
                            <>
                              <span>Passe sobre um ponto para inspecionar; clique para abrir o perfil.</span>
                              <span style={{ color: 'var(--ink-muted)' }}>
                                Mediana no estado: {formatBRL(medianDep)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="table-scroll" style={{ maxHeight: 280 }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Parlamentar</th>
                              <th className="num-col">Notas</th>
                              <th className="num-col">Média/nota</th>
                              <th className="num-col">Total líquido</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deputadosList.map((dep) => (
                              <tr key={dep.deputado_id}>
                                <td>
                                  {dep.nome_parlamentar} ({dep.partido ?? 'S/P'})
                                </td>
                                <td className="num-col">{formatInt(dep.qtd_despesas)}</td>
                                <td className="num-col">{formatBRL(dep.media_por_lancamento)}</td>
                                <td className="num-col">{formatBRL(dep.total_liquido)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div className="chart-footer-meta">
                  <span>Clique no parlamentar para abrir o perfil individual</span>
                  <span>Sem juízo de valor: tetos variam por mandato</span>
                </div>
              </article>

              {/* Gráfico 4: Distribuição por UF carregada */}
              <article className="chart-card">
                <div>
                  <div className="chart-card-header">
                    <div>
                      <h3 className="chart-card-title">Comparação entre UFs já coletadas</h3>
                      <p className="chart-card-sub">
                        Período: {selectedAno} · Média líquida por parlamentar carregado (R$)
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SegmentedTabs
                        groupId="uf-tabs"
                        value={ufView}
                        label="Alternar visualização por UF"
                        options={[
                          { id: 'grafico', label: 'Gráfico' },
                          { id: 'tabela', label: 'Tabela' },
                        ]}
                        onChange={setUfView}
                      />
                      <MethodPopover
                        title="Comparabilidade entre estados"
                        body="Cada unidade federativa possui um teto mensal oficial distinto calculado pela distância aérea até Brasília. Compare médias dentro do contexto da legislação da Câmara."
                        sourceLabel="Ato da Mesa · CEAP"
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    {!analytics || analytics.distribuicao_ufs.length === 0 ? (
                      <p style={{ color: 'var(--ink-muted)' }}>
                        Ainda não há múltiplas UFs coletadas para o ano {selectedAno}. Colete outro
                        estado para habilitar esta comparação.
                      </p>
                    ) : ufView === 'grafico' ? (
                      <div className="hbar-list">
                        {analytics.distribuicao_ufs.map((ufRow, idx) => {
                          const dimmed = hoveredUf !== null && hoveredUf !== ufRow.uf;
                          return (
                            <div
                              key={ufRow.uf}
                              className="hbar-row"
                              style={{ opacity: dimmed ? 0.42 : 1, transition: 'opacity 150ms ease' }}
                              onMouseEnter={() => setHoveredUf(ufRow.uf)}
                              onMouseLeave={() => setHoveredUf(null)}
                            >
                              <div className="hbar-meta">
                                <button
                                  type="button"
                                  onClick={() => onSelectUf(ufRow.uf)}
                                  style={{
                                    background: 'transparent',
                                    border: 0,
                                    padding: 0,
                                    color:
                                      ufRow.uf === selectedUf
                                        ? 'var(--accent-deep)'
                                        : 'var(--ink-primary)',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {ufRow.uf} — {ufRow.uf_nome} ({ufRow.qtd_deputados} dep.)
                                </button>
                                <span className="hbar-values tabular">
                                  Média {formatBRLCompact(ufRow.media_por_deputado)} / dep.
                                </span>
                              </div>
                              <AnimatedHBar
                                key={`${selectedAno}-uf-${ufRow.uf}`}
                                widthPct={Math.max(
                                  4,
                                  Math.round((Math.abs(ufRow.media_por_deputado) / maxUfAvg) * 100)
                                )}
                                delay={idx * 0.06}
                                color={
                                  ufRow.uf === selectedUf ? 'var(--accent)' : 'var(--ink-primary)'
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="table-scroll" style={{ maxHeight: 280 }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>UF</th>
                              <th className="num-col">Deputados</th>
                              <th className="num-col">Notas</th>
                              <th className="num-col">Média/dep.</th>
                              <th className="num-col">Total líquido</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analytics.distribuicao_ufs.map((ufRow) => (
                              <tr key={ufRow.uf}>
                                <td>
                                  {ufRow.uf} — {ufRow.uf_nome}
                                </td>
                                <td className="num-col">{formatInt(ufRow.qtd_deputados)}</td>
                                <td className="num-col">{formatInt(ufRow.qtd_despesas)}</td>
                                <td className="num-col">{formatBRL(ufRow.media_por_deputado)}</td>
                                <td className="num-col">{formatBRL(ufRow.total_liquido)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div className="chart-footer-meta">
                  <span>Exibe somente UFs com coleta persistida em {selectedAno}</span>
                  <a
                    href="https://www2.camara.leg.br/transparencia/acesso-a-informacao/copy_of_perguntas-frequentes/cota-para-o-exercicio-da-atividade-parlamentar"
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    Tetos da CEAP por UF
                    <ExternalLink size={12} />
                  </a>
                </div>
              </article>
            </div>

            {analytics?.aviso_metodologico && (
              <div className="banner" style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Info size={18} color="var(--status-info)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ margin: 0, color: 'var(--ink-secondary)', fontSize: '0.88rem' }}>
                    <strong style={{ color: 'var(--ink-primary)' }}>Nota metodológica: </strong>
                    {analytics.aviso_metodologico}
                  </p>
                </div>
              </div>
            )}
          </AnimatedContent>
        )}
      </div>
    </section>
  );
}
