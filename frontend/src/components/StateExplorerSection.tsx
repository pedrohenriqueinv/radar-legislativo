import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Check, RefreshCw } from 'lucide-react';
import type { DeputadoCardOut, MetaResponse, OverviewResponse } from '../types/api';
import {
  BRAZIL_TILE_GRID,
  formatBRL,
  formatInt,
  formatPct,
  shortenCategory,
} from '../utils/format';
import { AnimatedContent } from './motion/AnimatedContent';
import { AnimatedHBar } from './motion/InViewBar';

const REGIONS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'] as const;
type BrazilRegion = (typeof REGIONS)[number];

interface StateExplorerSectionProps {
  meta: MetaResponse | null;
  overview: OverviewResponse | null;
  deputados: DeputadoCardOut[];
  selectedUf: string;
  selectedAno: number;
  onChangeUf: (uf: string) => void;
  onChangeAno: (ano: number) => void;
  onOpenCollectionModal: () => void;
}

export function StateExplorerSection({
  meta,
  overview,
  deputados,
  selectedUf,
  selectedAno,
  onChangeUf,
  onChangeAno,
  onOpenCollectionModal,
}: StateExplorerSectionProps) {
  const [viewMode, setViewMode] = useState<'grafico' | 'tabela'>('grafico');
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);

  const selectedTile = useMemo(
    () => BRAZIL_TILE_GRID.find((t) => t.uf === selectedUf),
    [selectedUf]
  );

  const [activeRegion, setActiveRegion] = useState<BrazilRegion>(
    (selectedTile?.regiao as BrazilRegion) ?? 'Centro-Oeste'
  );

  useEffect(() => {
    if (selectedTile?.regiao && REGIONS.includes(selectedTile.regiao as BrazilRegion)) {
      setActiveRegion(selectedTile.regiao as BrazilRegion);
    }
  }, [selectedTile?.regiao]);

  const ufSummaryMap = useMemo(() => {
    const map = new Map<string, NonNullable<MetaResponse>['ufs'][number]>();
    for (const item of meta?.ufs ?? []) {
      map.set(item.uf, item);
    }
    return map;
  }, [meta]);

  const regionUfs = useMemo(() => {
    const list = BRAZIL_TILE_GRID.filter((t) => t.regiao === activeRegion);
    return [...list].sort((a, b) => {
      const aHasYear = ufSummaryMap.get(a.uf)?.anos_disponiveis.includes(selectedAno) ?? false;
      const bHasYear = ufSummaryMap.get(b.uf)?.anos_disponiveis.includes(selectedAno) ?? false;
      if (aHasYear !== bHasYear) return aHasYear ? -1 : 1;
      if (a.uf === selectedUf) return -1;
      if (b.uf === selectedUf) return 1;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [activeRegion, selectedAno, selectedUf, ufSummaryMap]);

  const collectedInRegion = useMemo(
    () =>
      regionUfs.filter((t) => ufSummaryMap.get(t.uf)?.anos_disponiveis.includes(selectedAno)).length,
    [regionUfs, selectedAno, ufSummaryMap]
  );

  const selectedUfName =
    overview?.uf_nome ?? selectedTile?.nome ?? ufSummaryMap.get(selectedUf)?.nome ?? selectedUf;

  const maxCatTotal = useMemo(() => {
    const vals = (overview?.categorias_resumo ?? []).map((c) => Math.abs(c.total_liquido));
    return Math.max(...vals, 1);
  }, [overview]);

  const scrollToDeputies = () => {
    document.getElementById('parlamentares')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="estados" className="page-section page-section--broadsheet">
      <div className="container">
        <div className="section-header states-hero-header">
          <div>
            <h2 className="states-broadsheet-title">Exploração por unidade federativa</h2>
            <p className="section-subtitle">
              Selecione uma UF para consultar a cobertura, as despesas e os parlamentares do recorte.
            </p>
          </div>
        </div>

        <AnimatedContent delay={0.05} distance={14}>
          <div className="states-broadsheet-grid">
            {/* Coluna esquerda: Escolha por região + Cards 2 colunas */}
            <div className="states-region-col">
              <div className="states-region-header">
                <h3 className="states-subhead-serif">Escolha por região</h3>
                <p className="states-subhead-caption">
                  Navegue por região e selecione uma unidade federativa.
                </p>
              </div>

              <div className="region-tabs-bar" role="tablist" aria-label="Regiões do Brasil">
                {REGIONS.map((reg) => {
                  const isActive = activeRegion === reg;
                  return (
                    <button
                      key={reg}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`region-tab-btn ${isActive ? 'region-tab-btn--active' : ''}`}
                      onClick={() => setActiveRegion(reg)}
                    >
                      <span>{reg}</span>
                      {isActive && (
                        <motion.span
                          layoutId="region-tab-indicator"
                          className="region-tab-underline"
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="region-meta-row">
                <h4 className="region-active-name">{activeRegion}</h4>
                <span className="region-count-kicker">
                  {regionUfs.length}{' '}
                  {regionUfs.length === 1 ? 'UNIDADE FEDERATIVA' : 'UNIDADES FEDERATIVAS'}
                </span>
              </div>

              <div className="uf-editorial-grid" role="listbox" aria-label={`Estados da região ${activeRegion}`}>
                {regionUfs.map((tile) => {
                  const summary = ufSummaryMap.get(tile.uf);
                  const hasYear = summary?.anos_disponiveis.includes(selectedAno) ?? false;
                  const isSelected = selectedUf === tile.uf;
                  const altYears = summary?.anos_disponiveis ?? [];

                  let statusCaption = `Sem coleta em ${selectedAno}`;
                  if (isSelected && hasYear) {
                    statusCaption = 'Selecionado · Coleta completa';
                  } else if (isSelected && !hasYear) {
                    statusCaption = `Selecionado · Sem coleta em ${selectedAno}`;
                  } else if (hasYear) {
                    statusCaption = `${formatInt(summary?.total_deputados_carregados ?? 0)} parlamentares · Coletado`;
                  } else if (altYears.length > 0) {
                    statusCaption = `Sem ${selectedAno} (há ${altYears.join(', ')})`;
                  }

                  return (
                    <button
                      key={tile.uf}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => onChangeUf(tile.uf)}
                      className={`uf-editorial-card ${
                        isSelected
                          ? 'uf-editorial-card--selected'
                          : hasYear
                            ? 'uf-editorial-card--collected'
                            : 'uf-editorial-card--empty'
                      }`}
                    >
                      <div className="uf-editorial-top">
                        <span className="uf-code-badge">{tile.uf}</span>
                        {isSelected ? (
                          <Check size={14} className="uf-card-icon uf-card-icon--check" aria-hidden="true" />
                        ) : (
                          <ArrowRight size={14} className="uf-card-icon" aria-hidden="true" />
                        )}
                      </div>
                      <div className="uf-editorial-name">{tile.nome}</div>
                      <div className="uf-editorial-status">{statusCaption}</div>
                    </button>
                  );
                })}
              </div>

              <p className="region-coverage-footnote">
                {collectedInRegion === 0
                  ? `Nenhuma UF da região possui coleta persistida em ${selectedAno}.`
                  : `Coleta completa em ${collectedInRegion} ${
                      collectedInRegion === 1 ? 'das' : 'das'
                    } ${regionUfs.length} UFs da região em ${selectedAno}.`}
              </p>
            </div>

            <div className="states-split-rule" aria-hidden="true" />

            {/* Coluna direita: Detalhamento amplo da UF selecionada */}
            <div className="states-detail-col">
              <div className="states-detail-head">
                <h3 className="states-selected-name">{selectedUfName}</h3>
                {overview?.has_data ? (
                  <p className="states-selected-metrics tabular">
                    {formatInt(overview.qtd_deputados)} parlamentares ·{' '}
                    {formatInt(overview.qtd_despesas)} despesas · {formatBRL(overview.total_liquido)}
                  </p>
                ) : (
                  <p className="states-selected-metrics">
                    {selectedUf} · Sem coleta registrada para {selectedAno}
                  </p>
                )}
              </div>

              <div className="states-cat-bar">
                <span className="states-cat-kicker">DISTRIBUIÇÃO POR CATEGORIA</span>

                <div className="editorial-view-toggle" role="tablist" aria-label="Formato de categorias">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'grafico'}
                    className={`editorial-toggle-btn ${
                      viewMode === 'grafico' ? 'editorial-toggle-btn--active' : ''
                    }`}
                    onClick={() => setViewMode('grafico')}
                  >
                    Gráfico
                  </button>
                  <span className="editorial-toggle-sep" aria-hidden="true">
                    /
                  </span>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'tabela'}
                    className={`editorial-toggle-btn ${
                      viewMode === 'tabela' ? 'editorial-toggle-btn--active' : ''
                    }`}
                    onClick={() => setViewMode('tabela')}
                  >
                    Tabela
                  </button>
                </div>
              </div>

              {!overview?.has_data ? (
                <div className="states-empty-panel">
                  <p style={{ margin: '0 0 12px', fontWeight: 600, color: 'var(--ink-primary)' }}>
                    Nenhuma despesa persistida para {selectedUfName} ({selectedUf}) em {selectedAno}.
                  </p>
                  <p style={{ margin: '0 0 18px', fontSize: '0.9rem', color: 'var(--ink-secondary)' }}>
                    O Radar Legislativo exibe exclusivamente dados reais coletados na API oficial da
                    Câmara dos Deputados. Você pode coletar este recorte agora ou abrir um dos
                    recortes já carregados.
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={onOpenCollectionModal}
                    >
                      <RefreshCw size={14} />
                      Coletar {selectedUf}/{selectedAno} na Câmara
                    </button>

                    {(meta?.recortes_carregados ?? []).slice(0, 4).map((rec) => (
                      <button
                        key={`${rec.uf}-${rec.ano}`}
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          onChangeUf(rec.uf);
                          onChangeAno(rec.ano);
                        }}
                      >
                        Abrir {rec.uf}/{rec.ano}
                      </button>
                    ))}
                  </div>
                </div>
              ) : viewMode === 'grafico' ? (
                <div className="cat-broadsheet-list">
                  {overview.categorias_resumo.map((cat, idx) => {
                    const widthPct = Math.max(
                      0.8,
                      Math.round((Math.abs(cat.total_liquido) / maxCatTotal) * 1000) / 10
                    );
                    const dimmed = hoveredCat !== null && hoveredCat !== cat.categoria;

                    return (
                      <div
                        key={`${overview.uf}-${overview.ano}-${cat.categoria}`}
                        className="cat-broadsheet-row"
                        style={{
                          opacity: dimmed ? 0.56 : 1,
                          transition: 'opacity 180ms ease',
                        }}
                        onMouseEnter={() => setHoveredCat(cat.categoria)}
                        onMouseLeave={() => setHoveredCat(null)}
                      >
                        <div className="cat-broadsheet-head">
                          <span className="cat-broadsheet-label" title={cat.categoria}>
                            {shortenCategory(cat.categoria)}
                          </span>
                          <span className="cat-broadsheet-values tabular">
                            {formatBRL(cat.total_liquido)} · {formatPct(cat.percentual)}
                          </span>
                        </div>
                        <AnimatedHBar
                          widthPct={widthPct}
                          delay={idx * 0.04}
                          trackHeight={5}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="table-scroll" style={{ marginTop: 12 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Categoria</th>
                        <th className="num-col">Lançamentos</th>
                        <th className="num-col">Total líquido</th>
                        <th className="num-col">Participação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.categorias_resumo.map((cat) => (
                        <tr key={cat.categoria}>
                          <td title={cat.categoria}>{shortenCategory(cat.categoria)}</td>
                          <td className="num-col">{formatInt(cat.qtd_lancamentos)}</td>
                          <td className="num-col">{formatBRL(cat.total_liquido)}</td>
                          <td className="num-col">{formatPct(cat.percentual)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {overview?.has_data && deputados.length > 0 && (
                <div className="states-detail-cta-row">
                  <button
                    type="button"
                    className="editorial-inline-cta"
                    onClick={scrollToDeputies}
                  >
                    Ver os {formatInt(deputados.length)} parlamentares
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="states-section-footer">
            <span>Fonte: Câmara dos Deputados · CEAP</span>
            <span>
              {selectedUfName} · {selectedAno}
            </span>
          </div>
        </AnimatedContent>
      </div>
    </section>
  );
}
