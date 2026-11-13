import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ExternalLink, Pause, Play, RefreshCw } from 'lucide-react';
import type { MetaResponse, OverviewResponse } from '../types/api';
import {
  formatBRL,
  formatBRLCompact,
  formatInt,
  getMonthLabel,
} from '../utils/format';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { Magnet } from './motion/Magnet';
import { MethodPopover } from './motion/MethodPopover';

interface HeroSectionProps {
  overview: OverviewResponse | null;
  meta: MetaResponse | null;
  loading: boolean;
  selectedUf: string;
  selectedAno: number;
  onExploreClick: () => void;
  onOpenCollectionModal: () => void;
  onQuickSelectCut: (uf: string, ano: number) => void;
}

const CONTRA_EASE: [number, number, number, number] = [0.48, 0.05, 0.35, 0.99];
const BAR_GROW_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export function HeroSection({
  overview,
  meta,
  loading,
  selectedUf,
  selectedAno,
  onExploreClick,
  onOpenCollectionModal,
  onQuickSelectCut,
}: HeroSectionProps) {
  const [hoveredMes, setHoveredMes] = useState<number | null>(null);
  const [pinnedMes, setPinnedMes] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const mesesComDados = useMemo(
    () => (overview?.serie_mensal ?? []).filter((m) => m.qtd_lancamentos > 0).map((m) => m.mes),
    [overview]
  );

  useEffect(() => {
    setHoveredMes(null);
    setPinnedMes(null);
    setIsPlaying(false);
  }, [selectedUf, selectedAno]);

  useEffect(() => {
    if (!isPlaying || mesesComDados.length === 0) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setIsPlaying(false);
      return;
    }

    const timer = window.setInterval(() => {
      setPinnedMes((prev) => {
        if (prev === null) return mesesComDados[0];
        const idx = mesesComDados.indexOf(prev);
        if (idx === -1 || idx === mesesComDados.length - 1) {
          setIsPlaying(false);
          return null;
        }
        return mesesComDados[idx + 1];
      });
    }, 900);

    return () => window.clearInterval(timer);
  }, [isPlaying, mesesComDados]);

  const focusedMes = isPlaying ? pinnedMes : hoveredMes ?? pinnedMes;

  const maxMonthVal = useMemo(() => {
    const values = (overview?.serie_mensal ?? []).map((m) => Math.abs(m.total_liquido));
    return Math.max(...values, 1);
  }, [overview]);

  const activeMonthObj = useMemo(() => {
    if (focusedMes === null || !overview?.serie_mensal) return null;
    return overview.serie_mensal.find((m) => m.mes === focusedMes) ?? null;
  }, [focusedMes, overview]);

  const displayedAmount = activeMonthObj ? activeMonthObj.total_liquido : overview?.total_liquido ?? 0;

  const sliderMonth = focusedMes ?? 1;
  const scrubberPct = ((sliderMonth - 1) / 11) * 100;

  return (
    <section id="topo" className="hero-broadsheet" aria-label="Resumo executivo do Radar Legislativo">
      <div className="hero-backdrop-layer">
        <img
          src="/assets/congresso-backdrop.jpg"
          alt=""
          aria-hidden="true"
          className="hero-backdrop-img"
        />
        <div className="hero-backdrop-fade" aria-hidden="true" />

        <div className="container hero-split-grid">
          <motion.div
            className="hero-title-wrap"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.72, ease: CONTRA_EASE }}
          >
            <h1 className="hero-broadsheet-title">
              A cota em
              <br />
              números.
            </h1>
            <p className="hero-lead-deck">
              <strong>Dinheiro público, nota por nota.</strong> Descubra quem gastou e para onde
              vai cada real da verba parlamentar.
            </p>
          </motion.div>

          <div className="hero-split-rule" aria-hidden="true" />

          <motion.div
            className="hero-right-metric"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.72, delay: 0.08, ease: CONTRA_EASE }}
          >
            {loading || !overview ? (
              <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="skeleton-block" style={{ height: 52, width: '85%' }} />
                <div className="skeleton-block" style={{ height: 22, width: '58%' }} />
              </div>
            ) : overview?.has_data ? (
              <>
                <div className="hero-figure-display">
                  <AnimatedNumber
                    value={displayedAmount}
                    kind="brl"
                    duration={focusedMes === null ? 1.55 : 0.45}
                  />
                </div>
                <p className="hero-figure-sub">
                  Despesas registradas
                  {activeMonthObj ? ` · ${getMonthLabel(activeMonthObj.mes)}` : ''} · {overview.uf} ·{' '}
                  {overview.ano}
                </p>
              </>
            ) : (
              <div>
                <div
                  className="hero-figure-display"
                  style={{ fontSize: 'clamp(1.7rem, 3vw, 2.35rem)' }}
                >
                  Sem coleta para {selectedUf} · {selectedAno}
                </div>
                <p className="hero-figure-sub" style={{ marginTop: 6 }}>
                  O Radar Legislativo exibe apenas registros reais da Câmara dos Deputados.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {(meta?.recortes_carregados ?? []).slice(0, 3).map((rec) => (
                    <button
                      key={`${rec.uf}-${rec.ano}`}
                      type="button"
                      className="btn btn-sm"
                      onClick={() => onQuickSelectCut(rec.uf, rec.ano)}
                    >
                      Abrir {rec.uf}/{rec.ano}
                    </button>
                  ))}
                  <Magnet>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={onOpenCollectionModal}
                    >
                      <RefreshCw size={13} />
                      Coletar {selectedUf}/{selectedAno}
                    </button>
                  </Magnet>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <div className="hero-chart-band">
        <div className="hero-chart-container">
          {loading || !overview ? (
            <>
              <div className="hero-bars-stage">
                <div className="hero-bars-grid" aria-hidden="true">
                  {Array.from({ length: 12 }, (_, idx) => (
                    <div key={idx} className="hero-bar-col">
                      <span className="hero-bar-track">
                        <span
                          className="hero-bar-fill skeleton-block"
                          style={{
                            height: '4%',
                            background: 'rgba(181, 56, 36, 0.14)',
                          }}
                        />
                      </span>
                      <span className="hero-bar-label" style={{ opacity: 0.45 }}>
                        &nbsp;
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="hero-scrubber-row tabular" aria-hidden="true">
                <span className="skeleton-block" style={{ width: 22, height: 22, borderRadius: '50%' }} />
                <span>Jan</span>
                <div className="scrubber-track-wrap">
                  <div className="scrubber-track-bg" />
                </div>
                <span>Dez · {selectedAno}</span>
              </div>
            </>
          ) : (
            overview.has_data && (
            <>
              <div className="hero-bars-stage">
                <div
                  className={`hero-bars-grid ${focusedMes !== null ? 'hero-bars-grid--dimmed' : ''}`}
                  role="group"
                  aria-label="Série mensal de despesas"
                  onMouseLeave={() => {
                    if (!isPlaying) {
                      setHoveredMes(null);
                    }
                  }}
                >
                  {overview.serie_mensal.map((item, idx) => {
                    const heightPct =
                      item.qtd_lancamentos > 0
                        ? Math.max(8, Math.round((Math.abs(item.total_liquido) / maxMonthVal) * 100))
                        : 5;
                    const active = focusedMes === item.mes;
                    const highlighted = focusedMes !== null ? active : false;
                    const tooltipEdgeStyle =
                      idx === 0
                        ? { left: 0, transform: 'none' }
                        : idx === 11
                          ? { left: 'auto', right: 0, transform: 'none' }
                          : undefined;

                    return (
                      <button
                        key={item.mes}
                        type="button"
                        className={`hero-bar-col ${active ? 'hero-bar-col--active' : ''} ${
                          highlighted ? 'hero-bar-col--highlighted' : ''
                        } ${item.qtd_lancamentos === 0 ? 'hero-bar-col--empty' : ''}`}
                        onMouseEnter={() => {
                          if (!isPlaying) setHoveredMes(item.mes);
                        }}
                        onFocus={() => {
                          if (!isPlaying) setHoveredMes(item.mes);
                        }}
                        onBlur={() => {
                          if (!isPlaying) setHoveredMes(null);
                        }}
                        onClick={() => {
                          setIsPlaying(false);
                          setHoveredMes(null);
                          setPinnedMes((prev) => (prev === item.mes ? null : item.mes));
                        }}
                        aria-pressed={active}
                        aria-label={`${getMonthLabel(item.mes)}: ${formatBRL(item.total_liquido)}, ${formatInt(item.qtd_lancamentos)} lançamentos`}
                      >
                        {active && (
                          <div className="hero-bar-tooltip tabular" style={tooltipEdgeStyle}>
                            <strong>{getMonthLabel(item.mes)}</strong>: {formatBRLCompact(item.total_liquido)} ·{' '}
                            {formatInt(item.qtd_lancamentos)} docs
                          </div>
                        )}
                        <span className="hero-bar-track">
                          <motion.span
                            key={`${overview.uf}-${overview.ano}-m-${item.mes}`}
                            className="hero-bar-fill"
                            initial={{ scaleY: 0 }}
                            animate={{ scaleY: 1 }}
                            transition={{
                              duration: 1.55,
                              delay: 0.14 + idx * 0.085,
                              ease: BAR_GROW_EASE,
                            }}
                            style={{ height: `${heightPct}%` }}
                          />
                        </span>
                        <span className="hero-bar-label">{item.mes_nome}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="hero-scrubber-row tabular">
                <button
                  type="button"
                  className="scrubber-play-btn"
                  onClick={() => {
                    if (isPlaying) {
                      setIsPlaying(false);
                    } else {
                      setHoveredMes(null);
                      if (pinnedMes === null && mesesComDados.length > 0) {
                        setPinnedMes(mesesComDados[0]);
                      }
                      setIsPlaying(true);
                    }
                  }}
                  aria-label={isPlaying ? 'Pausar sequência mensal' : 'Reproduzir evolução mensal'}
                  disabled={mesesComDados.length < 2}
                >
                  {isPlaying ? <Pause size={10} /> : <Play size={10} style={{ marginLeft: 1 }} />}
                </button>

                <span>Jan</span>

                <div className="scrubber-track-wrap">
                  <div className="scrubber-track-bg">
                    <div
                      className="scrubber-track-fill"
                      style={{ width: `${scrubberPct}%` }}
                    />
                    <span
                      className="scrubber-thumb-dot"
                      style={{ left: `${scrubberPct}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    step={1}
                    value={sliderMonth}
                    onChange={(e) => {
                      setIsPlaying(false);
                      setHoveredMes(null);
                      setPinnedMes(Number(e.target.value));
                    }}
                    aria-label={`Percorrer meses de Janeiro a Dezembro de ${overview.ano}`}
                    className="scrubber-range-input"
                  />
                </div>

                <span>Dez · {overview.ano}</span>
              </div>
            </>
            )
          )}

          <div className="hero-bottom-rail">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 18px' }}>
              <Magnet magnetStrength={5}>
                <button type="button" className="hero-explore-link" onClick={onExploreClick}>
                  Explorar dados
                  <ArrowRight size={15} />
                </button>
              </Magnet>
            </div>

            <div className="hero-source-meta">
              <a
                href={overview?.fonte_oficial_url ?? 'https://dadosabertos.camara.leg.br/swagger/api.html'}
                target="_blank"
                rel="noreferrer"
                className="hero-source-link"
              >
                Fonte: Câmara dos Deputados
                <ExternalLink size={11} />
              </a>
              <MethodPopover
                title="Nota metodológica dos valores"
                body="Os totais mensais somam o valorLiquido de cada documento fiscal da CEAP após eventuais glosas administrativas. Créditos ou bilhetes aéreos compensados (SIGEPA) preservam sinal negativo original."
                sourceLabel="Câmara dos Deputados · API Dados Abertos v2"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
