import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowDown, ExternalLink, Pause, Play, RefreshCw } from 'lucide-react';
import type { MetaResponse, OverviewResponse } from '../types/api';
import { formatBRL, formatBRLCompact, formatInt, getMonthLabel } from '../utils/format';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { MethodPopover } from './motion/MethodPopover';
import { clamp, INSTANT_TRANSITION } from './charts/chartMotion';
import './HeroSection.css';

interface HeroSectionProps {
  overview: OverviewResponse | null;
  meta: MetaResponse | null;
  loading: boolean;
  failed: boolean;
  selectedUf: string;
  selectedAno: number;
  onExploreClick: () => void;
  onOpenCollectionModal: () => void;
  onQuickSelectCut: (uf: string, ano: number) => void;
}

const HERO_BAR_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 28,
  mass: 0.8,
};

function formatSignedDelta(val: number): string {
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1).replace('.', ',')}%`;
}

interface MonthlySeriesProps {
  overview: OverviewResponse;
  methodTitle: string;
  methodBody: string;
  methodSourceLabel: string;
}

const MonthlySeries = memo(function MonthlySeries({
  overview,
  methodTitle,
  methodBody,
  methodSourceLabel,
}: MonthlySeriesProps) {
  const shouldReduce = useReducedMotion();
  const [previewMonth, setPreviewMonth] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const series = overview.serie_mensal;

  const {
    firstMonth,
    lastMonth,
    minimum,
    span,
    baseline,
    avgMonthly,
    avgBottomPct,
    momMap,
  } = useMemo(() => {
    const withEntries = series.filter((item) => item.qtd_lancamentos > 0);
    let minVal = 0;
    let maxVal = 0;
    let activeSum = 0;
    for (const item of series) {
      if (item.total_liquido < minVal) minVal = item.total_liquido;
      if (item.total_liquido > maxVal) maxVal = item.total_liquido;
      if (item.qtd_lancamentos > 0) activeSum += item.total_liquido;
    }
    const rangeSpan = maxVal - minVal || 1;
    const zeroLine = (-minVal / rangeSpan) * 100;
    const mean = withEntries.length > 0 ? activeSum / withEntries.length : 0;
    const meanBottom = clamp(zeroLine + (mean / rangeSpan) * 100, 4, 96);

    const deltas = new Map<number, { pct: number; prevName: string }>();
    let prevActive: (typeof series)[number] | null = null;
    for (const item of series) {
      if (item.qtd_lancamentos > 0) {
        if (prevActive && Math.abs(prevActive.total_liquido) > 0.01) {
          const pct =
            ((item.total_liquido - prevActive.total_liquido) / Math.abs(prevActive.total_liquido)) *
            100;
          deltas.set(item.mes, { pct, prevName: prevActive.mes_nome });
        }
        prevActive = item;
      }
    }

    return {
      firstMonth: withEntries[0]?.mes,
      lastMonth: withEntries.at(-1)?.mes ?? 0,
      minimum: minVal,
      span: rangeSpan,
      baseline: zeroLine,
      avgMonthly: mean,
      avgBottomPct: meanBottom,
      momMap: deltas,
    };
  }, [series]);

  const activeMes = previewMonth ?? selectedMonth;
  const activeMonth = useMemo(
    () => (activeMes !== null ? series.find((item) => item.mes === activeMes) ?? null : null),
    [series, activeMes]
  );

  const activeDelta = activeMonth ? momMap.get(activeMonth.mes) ?? null : null;
  const amount = activeMonth?.total_liquido ?? overview.total_liquido;
  const timelineMonth = activeMonth?.mes ?? 0;
  const hasNegative = minimum < 0;

  useEffect(() => {
    if (!playing) return;
    const current = series.filter((item) => item.qtd_lancamentos > 0);
    const next = current.find((item) => item.mes > (selectedMonth ?? 0));
    const timer = window.setTimeout(() => {
      if (!next) setPlaying(false);
      setSelectedMonth(next?.mes ?? null);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [playing, selectedMonth, series]);

  function selectMonth(month: number | null) {
    setPlaying(false);
    setPreviewMonth(null);
    setSelectedMonth(month);
  }

  function handleBarKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentMes: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const idx = series.findIndex((s) => s.mes === currentMes);
    if (idx < 0) return;
    const nextItem = series[(idx + step + series.length) % series.length];
    if (!nextItem) return;
    selectMonth(nextItem.mes);
    const group = event.currentTarget.parentElement;
    const nextBtn = group?.querySelector<HTMLButtonElement>(
      `button[data-mes="${nextItem.mes}"]`
    );
    nextBtn?.focus();
  }

  return (
    <>
      <div className="radar-hero__metric">
        <p className="radar-hero__slice">
          {overview.uf_nome} · {overview.ano}
        </p>
        <p className="radar-hero__amount">
          <span className="sr-only">{formatBRL(amount)}</span>
          <span aria-hidden="true">
            <AnimatedNumber value={amount} duration={0.24} animateOnMount={false} />
          </span>
        </p>
        <p className="radar-hero__metric-label">
          {activeMonth
            ? `${getMonthLabel(activeMonth.mes)} · ${formatInt(activeMonth.qtd_lancamentos)} lançamentos`
            : `Total líquido no ano · ${formatInt(overview.qtd_despesas)} lançamentos`}
        </p>
      </div>

      <div className="radar-hero__series">
        <div className="radar-hero__series-heading">
          <h2>Despesas mês a mês</h2>
          <div className="radar-hero__series-controls">
            <p className="radar-hero__series-readout" aria-live="polite">
              {activeMonth ? (
                <>
                  <span>
                    {activeMonth.mes_nome} · {formatBRL(activeMonth.total_liquido)}
                  </span>
                  {activeDelta ? (
                    <span
                      className={`radar-hero__delta-pill mono tabular ${
                        activeDelta.pct > 0
                          ? 'radar-hero__delta-pill--up'
                          : 'radar-hero__delta-pill--down'
                      }`}
                    >
                      {formatSignedDelta(activeDelta.pct)} vs. {activeDelta.prevName}
                    </span>
                  ) : null}
                </>
              ) : (
                'Janeiro a dezembro'
              )}
            </p>
            {/* Trigger positioned above the bars so the popover opens upward into the backdrop and NEVER covers Ago–Dez */}
            <div className="radar-hero__method-anchor">
              <MethodPopover
                title={methodTitle}
                body={methodBody}
                sourceLabel={methodSourceLabel}
                placement="top-end"
              />
            </div>
          </div>
        </div>

        <div
          className="radar-hero__bars"
          role="group"
          aria-label="Série mensal de despesas"
          onPointerLeave={() => setPreviewMonth(null)}
        >
          <span className="radar-hero__gridlines" aria-hidden="true">
            <span className="radar-hero__baseline" style={{ bottom: `${baseline}%` }} />
            {avgMonthly > 0 ? (
              <span
                className={`radar-hero__avg-line${avgBottomPct > 82 ? ' radar-hero__avg-line--flip' : ''}`}
                style={{ bottom: `${avgBottomPct}%` }}
              >
                <span className="radar-hero__avg-pill mono tabular">
                  <span className="radar-hero__avg-tag">AVG</span>
                  Média · {formatBRLCompact(avgMonthly)}
                </span>
              </span>
            ) : null}
          </span>

          {series.map((item) => {
            const isActive = activeMonth?.mes === item.mes;
            const isNegative = item.total_liquido < 0;
            const heightPct = (Math.abs(item.total_liquido) / span) * 100;
            const bottomPct = baseline + (Math.min(0, item.total_liquido) / span) * 100;

            return (
              <button
                key={item.mes}
                type="button"
                data-mes={item.mes}
                className={`radar-hero__month${isNegative ? ' radar-hero__month--neg' : ''}`}
                data-active={isActive}
                aria-pressed={selectedMonth === item.mes}
                aria-label={`${getMonthLabel(item.mes)}: ${formatBRL(item.total_liquido)}, ${formatInt(item.qtd_lancamentos)} lançamentos`}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse' && !playing) setPreviewMonth(item.mes);
                }}
                onFocus={(event) => {
                  if (event.currentTarget.matches(':focus-visible') && !playing) {
                    setPreviewMonth(item.mes);
                  }
                }}
                onBlur={() => setPreviewMonth(null)}
                onClick={() => selectMonth(selectedMonth === item.mes ? null : item.mes)}
                onKeyDown={(event) => handleBarKeyDown(event, item.mes)}
              >
                <span className="radar-hero__track" aria-hidden="true">
                  <motion.span
                    className={`radar-hero__bar${
                      isNegative ? ' radar-hero__bar--neg' : ' radar-hero__bar--pos'
                    }${item.qtd_lancamentos === 0 && !hasNegative ? ' radar-hero__bar--empty' : ''}`}
                    animate={
                      shouldReduce
                        ? undefined
                        : {
                            scaleX: isActive ? 1.04 : 1,
                            y: isActive ? (isNegative ? 1 : -2) : 0,
                          }
                    }
                    transition={shouldReduce ? INSTANT_TRANSITION : HERO_BAR_SPRING}
                    style={
                      {
                        bottom: `${bottomPct}%`,
                        height: `${heightPct}%`,
                        '--bar-order': item.mes - 1,
                        transformOrigin: isNegative ? 'top' : 'bottom',
                      } as CSSProperties
                    }
                  />
                </span>
                <span className="radar-hero__month-label" aria-hidden="true">
                  {item.mes_nome}
                </span>
              </button>
            );
          })}
        </div>

        <div className="radar-hero__timeline">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={playing ? 'Pausar reprodução' : 'Reproduzir meses'}
            disabled={firstMonth === undefined}
            onClick={() => {
              setPreviewMonth(null);
              if (
                !playing &&
                firstMonth !== undefined &&
                (selectedMonth === null || selectedMonth >= lastMonth)
              ) {
                setSelectedMonth(firstMonth);
              }
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </Button>
          <input
            className="radar-hero__range"
            type="range"
            min={0}
            max={12}
            value={timelineMonth}
            style={{ '--timeline-progress': `${(timelineMonth / 12) * 100}%` } as CSSProperties}
            aria-label="Percorrer meses"
            aria-valuetext={timelineMonth === 0 ? 'Ano completo' : getMonthLabel(timelineMonth)}
            onChange={(event) => selectMonth(Number(event.target.value) || null)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => selectMonth(null)}
            aria-pressed={selectedMonth === null && !playing}
          >
            Ver ano
          </Button>
        </div>
      </div>
    </>
  );
});

export function HeroSection({
  overview,
  meta,
  loading,
  failed,
  selectedUf,
  selectedAno,
  onExploreClick,
  onOpenCollectionModal,
  onQuickSelectCut,
}: HeroSectionProps) {
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    const header = document.querySelector('.site-header-wrap');
    if (!hero || !header) return;
    const setHeaderHeight = () => {
      hero.style.setProperty('--hero-header-height', `${header.getBoundingClientRect().height}px`);
    };
    setHeaderHeight();
    const observer = new ResizeObserver(setHeaderHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const current = overview?.uf === selectedUf && overview.ano === selectedAno ? overview : null;
  const fromArchive = current?.ultima_execucao?.origem_api.endsWith('.csv.zip');

  const methodTitle = 'Nota metodológica dos valores';
  const methodBody = fromArchive
    ? 'Os totais mensais somam o valor líquido publicado no arquivo anual da CEAP. O recorte usa a UF e o mês de competência informados pela Câmara, preservando o sinal dos estornos.'
    : 'Os totais mensais somam o valor líquido dos documentos fiscais da CEAP após eventuais glosas administrativas. Créditos e bilhetes aéreos compensados preservam o sinal negativo original.';
  const methodSourceLabel = fromArchive
    ? 'Câmara dos Deputados · Arquivo anual da CEAP'
    : 'Câmara dos Deputados · API Dados Abertos v2';

  const hasSeries = Boolean(!loading && current?.has_data);

  return (
    <section ref={heroRef} id="topo" className="radar-hero" aria-labelledby="radar-hero-title">
      <div className="radar-hero__cover">
        <div className="radar-hero__intro">
          <h1 id="radar-hero-title">
            A cota em <span>números.</span>
          </h1>
          <p>
            Veja quanto os deputados federais gastam da cota parlamentar e para onde vai o dinheiro.
          </p>
          <Button type="button" size="lg" onClick={onExploreClick}>
            Explorar dados <ArrowDown data-icon="inline-end" aria-hidden="true" />
          </Button>
        </div>
        <figure className="radar-hero__photo">
          <img
            src="/assets/congresso-capa-1600.webp"
            srcSet="/assets/congresso-capa-768.webp 768w, /assets/congresso-capa-1600.webp 1600w"
            sizes="(max-width: 768px) 100vw, 76vw"
            width="1600"
            height="893"
            fetchPriority="high"
            alt="Congresso Nacional em Brasília ao pôr do sol"
          />
        </figure>
      </div>

      <div className="radar-hero__data" aria-busy={loading}>
        {loading ? (
          <div className="radar-hero__status" role="status">
            Carregando despesas de {selectedUf} · {selectedAno}…
            <Skeleton className="mt-2 h-8 w-56 max-w-full" aria-hidden="true" />
          </div>
        ) : current?.has_data ? (
          <MonthlySeries
            key={`${current.uf}/${current.ano}`}
            overview={current}
            methodTitle={methodTitle}
            methodBody={methodBody}
            methodSourceLabel={methodSourceLabel}
          />
        ) : (
          <div className="radar-hero__empty">
            <h2>
              {failed || !current
                ? 'Dados indisponíveis no momento'
                : `Sem despesas coletadas para ${selectedUf} · ${selectedAno}`}
            </h2>
            <div className="radar-hero__empty-actions">
              {(meta?.recortes_carregados ?? [])
                .filter((rec) => rec.uf !== selectedUf || rec.ano !== selectedAno)
                .slice(0, 3)
                .map((rec) => (
                  <Button
                    key={`${rec.uf}-${rec.ano}`}
                    type="button"
                    variant="outline"
                    onClick={() => onQuickSelectCut(rec.uf, rec.ano)}
                  >
                    Abrir {rec.uf}/{rec.ano}
                  </Button>
                ))}
              {!failed && current ? (
                <Button type="button" onClick={onOpenCollectionModal}>
                  <RefreshCw data-icon="inline-start" aria-hidden="true" />
                  Coletar {selectedUf}/{selectedAno}
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div className="radar-hero__source">
        <a
          href={
            current?.fonte_oficial_url ?? 'https://dadosabertos.camara.leg.br/swagger/api.html'
          }
          target="_blank"
          rel="noreferrer"
        >
          Fonte: Câmara dos Deputados <ExternalLink aria-hidden="true" />
        </a>
        {!hasSeries ? (
          <div className="radar-hero__method-anchor">
            <MethodPopover
              title={methodTitle}
              body={methodBody}
              sourceLabel={methodSourceLabel}
              placement="top-end"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
