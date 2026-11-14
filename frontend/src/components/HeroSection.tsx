import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ExternalLink, Pause, Play, RefreshCw } from 'lucide-react';
import type { MetaResponse, OverviewResponse } from '../types/api';
import { formatBRL, formatInt, getMonthLabel } from '../utils/format';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { MethodPopover } from './motion/MethodPopover';
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

function MonthlySeries({ overview }: { overview: OverviewResponse }) {
  const [previewMonth, setPreviewMonth] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const series = overview.serie_mensal;
  const monthsWithEntries = series.filter((item) => item.qtd_lancamentos > 0);
  const firstMonth = monthsWithEntries[0]?.mes;
  const lastMonth = monthsWithEntries.at(-1)?.mes ?? 0;
  const activeMonth = series.find((item) => item.mes === (previewMonth ?? selectedMonth));
  const amount = activeMonth?.total_liquido ?? overview.total_liquido;
  const timelineMonth = activeMonth?.mes ?? 0;
  const minimum = Math.min(0, ...series.map((item) => item.total_liquido));
  const maximum = Math.max(0, ...series.map((item) => item.total_liquido));
  const span = maximum - minimum || 1;
  const baseline = (-minimum / span) * 100;

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

  return (
    <>
      <div className="radar-hero__metric">
        <p className="radar-hero__slice">{overview.uf_nome} · {overview.ano}</p>
        <p className="radar-hero__amount">
          <span className="sr-only">{formatBRL(amount)}</span>
          <span aria-hidden="true"><AnimatedNumber value={amount} duration={0.24} animateOnMount={false} /></span>
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
          <p className="radar-hero__series-readout" aria-hidden="true">
            {activeMonth ? `${activeMonth.mes_nome} · ${formatBRL(activeMonth.total_liquido)}` : 'Janeiro a dezembro'}
          </p>
        </div>
        <div className="radar-hero__bars" role="group" aria-label="Série mensal de despesas"
          onPointerLeave={() => setPreviewMonth(null)}>
          <span className="radar-hero__gridlines" aria-hidden="true">
            <span className="radar-hero__baseline" style={{ bottom: `${baseline}%` }} />
          </span>
          {series.map((item) => (
            <button
              key={item.mes}
              type="button"
              className="radar-hero__month"
              data-active={activeMonth?.mes === item.mes}
              aria-pressed={selectedMonth === item.mes}
              aria-label={`${getMonthLabel(item.mes)}: ${formatBRL(item.total_liquido)}, ${formatInt(item.qtd_lancamentos)} lançamentos`}
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse' && !playing) setPreviewMonth(item.mes);
              }}
              onFocus={(event) => {
                if (event.currentTarget.matches(':focus-visible') && !playing) setPreviewMonth(item.mes);
              }}
              onBlur={() => setPreviewMonth(null)}
              onClick={() => selectMonth(selectedMonth === item.mes ? null : item.mes)}
            >
              <span className="radar-hero__track" aria-hidden="true">
                <span className="radar-hero__bar" style={{
                  bottom: `${baseline + (Math.min(0, item.total_liquido) / span) * 100}%`,
                  height: `${(Math.abs(item.total_liquido) / span) * 100}%`,
                  '--bar-order': item.mes - 1,
                  transformOrigin: item.total_liquido < 0 ? 'top' : 'bottom',
                } as CSSProperties} />
              </span>
              <span className="radar-hero__month-label" aria-hidden="true">{item.mes_nome}</span>
            </button>
          ))}
        </div>
        <div className="radar-hero__timeline">
          <Button type="button" variant="outline" size="icon"
            aria-label={playing ? 'Pausar reprodução' : 'Reproduzir meses'}
            disabled={firstMonth === undefined}
            onClick={() => {
              setPreviewMonth(null);
              if (!playing && firstMonth !== undefined
                && (selectedMonth === null || selectedMonth >= lastMonth)) {
                setSelectedMonth(firstMonth);
              }
              setPlaying(!playing);
            }}>
            {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </Button>
          <input className="radar-hero__range" type="range" min={0} max={12}
            value={timelineMonth}
            style={{ '--timeline-progress': `${(timelineMonth / 12) * 100}%` } as CSSProperties}
            aria-label="Percorrer meses"
            aria-valuetext={timelineMonth === 0 ? 'Ano completo' : getMonthLabel(timelineMonth)}
            onChange={(event) => selectMonth(Number(event.target.value) || null)} />
          <Button type="button" variant="ghost" size="sm" onClick={() => selectMonth(null)}
            aria-pressed={selectedMonth === null && !playing}>
            Ver ano
          </Button>
        </div>
      </div>
    </>
  );
}

export function HeroSection({
  overview, meta, loading, failed, selectedUf, selectedAno,
  onExploreClick, onOpenCollectionModal, onQuickSelectCut,
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

  return (
    <section ref={heroRef} id="topo" className="radar-hero" aria-labelledby="radar-hero-title">
      <div className="radar-hero__cover">
        <div className="radar-hero__intro">
          <h1 id="radar-hero-title">A cota em <span>números.</span></h1>
          <p>Veja quanto os deputados federais gastam da cota parlamentar e para onde vai o dinheiro.</p>
          <Button type="button" size="lg" onClick={onExploreClick}>
            Explorar dados <ArrowDown data-icon="inline-end" aria-hidden="true" />
          </Button>
        </div>
        <figure className="radar-hero__photo">
          <img src="/assets/congresso-capa-1600.webp"
            srcSet="/assets/congresso-capa-768.webp 768w, /assets/congresso-capa-1600.webp 1600w"
            sizes="(max-width: 768px) 100vw, 76vw" width="1600" height="893"
            fetchPriority="high" alt="Congresso Nacional em Brasília ao pôr do sol" />
        </figure>
      </div>
      <div className="radar-hero__data" aria-busy={loading}>
        {loading ? (
          <div className="radar-hero__status" role="status">
            Carregando despesas de {selectedUf} · {selectedAno}…
            <Skeleton className="mt-2 h-8 w-56 max-w-full" aria-hidden="true" />
          </div>
        ) : current?.has_data ? (
          <MonthlySeries key={`${current.uf}/${current.ano}`} overview={current} />
        ) : (
          <div className="radar-hero__empty">
            <h2>{failed || !current ? 'Dados indisponíveis no momento' : `Sem despesas coletadas para ${selectedUf} · ${selectedAno}`}</h2>
            <div className="radar-hero__empty-actions">
              {(meta?.recortes_carregados ?? [])
                .filter((rec) => rec.uf !== selectedUf || rec.ano !== selectedAno)
                .slice(0, 3).map((rec) => (
                  <Button key={`${rec.uf}-${rec.ano}`} type="button" variant="outline"
                    onClick={() => onQuickSelectCut(rec.uf, rec.ano)}>
                    Abrir {rec.uf}/{rec.ano}
                  </Button>
                ))}
              {!failed && current && (
                <Button type="button" onClick={onOpenCollectionModal}>
                  <RefreshCw data-icon="inline-start" aria-hidden="true" />
                  Coletar {selectedUf}/{selectedAno}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="radar-hero__source">
        <a href={current?.fonte_oficial_url ?? 'https://dadosabertos.camara.leg.br/swagger/api.html'}
          target="_blank" rel="noreferrer">
          Fonte: Câmara dos Deputados <ExternalLink aria-hidden="true" />
        </a>
        <MethodPopover
          title="Nota metodológica dos valores"
          body="Os totais mensais somam o valor líquido dos documentos fiscais da CEAP após eventuais glosas administrativas. Créditos e bilhetes aéreos compensados preservam o sinal negativo original."
          sourceLabel="Câmara dos Deputados · API Dados Abertos v2"
        />
      </div>
    </section>
  );
}
