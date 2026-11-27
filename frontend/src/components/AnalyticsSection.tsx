import { useDeferredValue, useMemo, useState } from 'react';
import { ExternalLink, Info } from 'lucide-react';
import type { AnalyticsResponse, DeputadoCardOut } from '../types/api';
import { formatBRL, formatBRLCompact, formatInt, formatPct, getMonthLabel } from '../utils/format';
import { AnimatedContent } from './motion/AnimatedContent';
import { AnimatedHBar } from './motion/InViewBar';
import { MethodPopover } from './motion/MethodPopover';
import { CategoryDonutChart } from './charts/CategoryDonutChart';
import { DeputyScatterChart } from './charts/DeputyScatterChart';
import { HexbinClusterChart } from './charts/HexbinClusterChart';
import { MonthlyAreaChart } from './charts/MonthlyAreaChart';
import { SegmentedTabs, type TabOption } from './charts/SegmentedTabs';
import { UfComparisonPanel } from './charts/UfComparisonPanel';
import './AnalyticsSection.css';

interface AnalyticsSectionProps {
  analytics: AnalyticsResponse | null;
  loading: boolean;
  selectedUf: string;
  selectedAno: number;
  onSelectUf: (uf: string) => void;
  onOpenDeputy: (id: number) => void;
  /** Optional: cards of the active cut (photos & share) to enrich the Hexbin tooltip */
  deputados?: DeputadoCardOut[];
}

type CatView = 'donut' | 'hexbin' | 'tabela';
type MesView = 'area' | 'barras' | 'tabela';
type DepView = 'barras' | 'dispersao' | 'tabela';
type UfView = 'comparativo' | 'tabela';

const CAT_OPTIONS: readonly TabOption<CatView>[] = [
  { id: 'donut', label: 'Donut' },
  { id: 'hexbin', label: 'Hexbin' },
  { id: 'tabela', label: 'Tabela' },
];
const MES_OPTIONS: readonly TabOption<MesView>[] = [
  { id: 'area', label: 'Área' },
  { id: 'barras', label: 'Barras' },
  { id: 'tabela', label: 'Tabela' },
];
const DEP_OPTIONS: readonly TabOption<DepView>[] = [
  { id: 'barras', label: 'Barras' },
  { id: 'dispersao', label: 'Dispersão' },
  { id: 'tabela', label: 'Tabela' },
];
const UF_OPTIONS: readonly TabOption<UfView>[] = [
  { id: 'comparativo', label: 'Comparativo' },
  { id: 'tabela', label: 'Tabela' },
];

const SKELETON_CARDS = (
  <div className="analytics-grid">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="chart-card">
        <div className="skeleton-block" style={{ height: 240, width: '100%' }} />
      </div>
    ))}
  </div>
);

const EMPTY_LIST: never[] = [];

export function AnalyticsSection({
  analytics: liveAnalytics,
  loading,
  selectedUf,
  selectedAno,
  onSelectUf,
  onOpenDeputy,
  deputados,
}: AnalyticsSectionProps) {
  // Heavy SVG charts re-render at lower priority when a new cut arrives
  const analytics = useDeferredValue(liveAnalytics);

  const [catView, setCatView] = useState<CatView>('donut');
  const [mesView, setMesView] = useState<MesView>('area');
  const [depView, setDepView] = useState<DepView>('barras');
  const [ufView, setUfView] = useState<UfView>('comparativo');
  const [hoveredDepId, setHoveredDepId] = useState<number | null>(null);

  const categories = analytics?.por_categoria ?? EMPTY_LIST;
  const monthlySeries = analytics?.evolucao_mensal ?? EMPTY_LIST;
  const deputadosList = analytics?.comparacao_parlamentares ?? EMPTY_LIST;
  const ufRows = analytics?.distribuicao_ufs ?? EMPTY_LIST;
  const hasData = Boolean(analytics?.has_data);

  const { maxDep, medianDep } = useMemo(() => {
    if (deputadosList.length === 0) return { maxDep: 1, medianDep: 0 };
    let max = 1;
    const totals: number[] = [];
    for (const d of deputadosList) {
      const abs = Math.abs(d.total_liquido);
      if (abs > max) max = abs;
      totals.push(d.total_liquido);
    }
    totals.sort((a, b) => a - b);
    const mid = Math.floor(totals.length / 2);
    const median = totals.length % 2 === 0 ? (totals[mid - 1] + totals[mid]) / 2 : totals[mid];
    return { maxDep: max, medianDep: median };
  }, [deputadosList]);

  return (
    <section id="analises" className="page-section page-section--alt analytics-section">
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
          SKELETON_CARDS
        ) : (
          <AnimatedContent>
            <div className="analytics-grid">
              {/* 1 · Composição por categoria (Donut | Hexbin | Tabela) */}
              <article className="chart-card">
                <div>
                  <div className="chart-card-header">
                    <div>
                      <h3 className="chart-card-title">Composição por categoria</h3>
                      <p className="chart-card-sub">
                        Recorte: {selectedUf} · Período: {selectedAno} · Unidade: R$ (BRL)
                      </p>
                    </div>
                    <div className="chart-card-tools">
                      <SegmentedTabs
                        groupId="cat-tabs"
                        value={catView}
                        label="Alternar visualização de categorias"
                        options={CAT_OPTIONS}
                        onChange={setCatView}
                      />
                      <MethodPopover
                        title="Participação por categoria"
                        body="O anel agrupa as 5 maiores rubricas da cota parlamentar e soma as demais em Outras. O modo Hexbin agrupa cada parlamentar do recorte em colmeias por partido ou faixa de gasto; clique em um hexágono para abrir o perfil."
                        sourceLabel="CEAP · tipoDespesa"
                      />
                    </div>
                  </div>

                  <div className="chart-card-body">
                    {!hasData || !analytics ? (
                      <p className="chart-empty">Sem dados coletados para {selectedUf}/{selectedAno}.</p>
                    ) : catView === 'donut' ? (
                      <CategoryDonutChart
                        selectedUf={selectedUf}
                        selectedAno={selectedAno}
                        categories={categories}
                      />
                    ) : catView === 'hexbin' ? (
                      <HexbinClusterChart
                        selectedUf={selectedUf}
                        selectedAno={selectedAno}
                        deputies={deputadosList}
                        deputadosCards={deputados}
                        onOpenDeputy={onOpenDeputy}
                      />
                    ) : (
                      <div className="table-scroll" style={{ maxHeight: 300 }}>
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
                            {categories.map((cat) => (
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

              {/* 2 · Evolução mensal (Área + crosshair | Barras arredondadas | Tabela) */}
              <article className="chart-card">
                <div>
                  <div className="chart-card-header">
                    <div>
                      <h3 className="chart-card-title">Evolução mensal das despesas</h3>
                      <p className="chart-card-sub">
                        Recorte: {selectedUf} · Período: Jan–Dez {selectedAno} · Unidade: R$ (BRL)
                      </p>
                    </div>
                    <div className="chart-card-tools">
                      <SegmentedTabs
                        groupId="mes-tabs"
                        value={mesView}
                        label="Alternar visualização mensal"
                        options={MES_OPTIONS}
                        onChange={setMesView}
                      />
                      <MethodPopover
                        title="Curva de competência mensal"
                        body="Cada ponto agrega o valor líquido das notas emitidas no mês correspondente, comparado à linha tracejada de média dos meses ativos (AVG). A variação % compara com o mês ativo anterior. As mini-tendências distribuem a série pela participação anual de cada rubrica."
                        sourceLabel="numMes / numAno · CEAP"
                      />
                    </div>
                  </div>

                  <div className="chart-card-body">
                    {!hasData || !analytics ? (
                      <p className="chart-empty">
                        Sem série mensal carregada para {selectedUf}/{selectedAno}.
                      </p>
                    ) : mesView === 'tabela' ? (
                      <div className="table-scroll" style={{ maxHeight: 300 }}>
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
                            {monthlySeries.map((m) => (
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
                    ) : (
                      <MonthlyAreaChart
                        selectedUf={selectedUf}
                        selectedAno={selectedAno}
                        viewMode={mesView}
                        series={monthlySeries}
                        categories={categories}
                      />
                    )}
                  </div>
                </div>

                <div className="chart-footer-meta">
                  <span>Fonte: Câmara dos Deputados · CEAP</span>
                  <span>Unidade: R$ por mês de competência</span>
                </div>
              </article>

              {/* 3 · Parlamentares (Barras | Dispersão | Tabela) */}
              <article className="chart-card chart-card--wide">
                <div>
                  <div className="chart-card-header">
                    <div>
                      <h3 className="chart-card-title">Volume registrado por parlamentar</h3>
                      <p className="chart-card-sub">
                        Recorte: {selectedUf} ({selectedAno}) · Comparação descritiva em R$
                      </p>
                    </div>
                    <div className="chart-card-tools">
                      <SegmentedTabs
                        groupId="dep-tabs"
                        value={depView}
                        label="Alternar visualização por parlamentar"
                        options={DEP_OPTIONS}
                        onChange={setDepView}
                      />
                      <MethodPopover
                        title="Comparação entre parlamentares"
                        body="O modo Dispersão posiciona cada deputado pelo total líquido contra a linha de mediana do estado (MED). Clique em qualquer ponto ou nome para abrir o dossiê completo."
                        sourceLabel="CEAP · Deputados ativos"
                      />
                    </div>
                  </div>

                  <div className="chart-card-body">
                    {!hasData ? (
                      <p className="chart-empty">
                        Nenhum parlamentar disponível para {selectedUf}/{selectedAno}.
                      </p>
                    ) : depView === 'barras' ? (
                      <div className="hbar-list dep-bars-grid">
                        {deputadosList.slice(0, 8).map((dep, idx) => {
                          const dimmed = hoveredDepId !== null && hoveredDepId !== dep.deputado_id;
                          const exactPct = Math.max(
                            0,
                            Math.min(100, (Math.max(0, dep.total_liquido) / maxDep) * 100)
                          );
                          return (
                            <div
                              key={dep.deputado_id}
                              className="hbar-row"
                              style={{ opacity: dimmed ? 0.42 : 1, transition: 'opacity 150ms ease' }}
                              onMouseEnter={() => setHoveredDepId(dep.deputado_id)}
                              onMouseLeave={() => setHoveredDepId(null)}
                            >
                              <div className="hbar-meta">
                                <button
                                  type="button"
                                  className="dep-bar-name"
                                  onClick={() => onOpenDeputy(dep.deputado_id)}
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
                                widthPct={Number(exactPct.toFixed(2))}
                                delay={idx * 0.04}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : depView === 'dispersao' ? (
                      <DeputyScatterChart
                        selectedUf={selectedUf}
                        selectedAno={selectedAno}
                        deputies={deputadosList}
                        maxDep={maxDep}
                        medianDep={medianDep}
                        onOpenDeputy={onOpenDeputy}
                      />
                    ) : (
                      <div className="table-scroll" style={{ maxHeight: 300 }}>
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
                                  <button
                                    type="button"
                                    className="dep-bar-name"
                                    onClick={() => onOpenDeputy(dep.deputado_id)}
                                  >
                                    {dep.nome_parlamentar} ({dep.partido ?? 'S/P'})
                                  </button>
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

              {/* 4 · Comparação entre UFs (twin editorial tables, full width) */}
              <article className="chart-card chart-card--wide">
                <div>
                  <div className="chart-card-header">
                    <div>
                      <h3 className="chart-card-title">Comparação entre UFs já coletadas</h3>
                      <p className="chart-card-sub">
                        Período: {selectedAno} · Média líquida por parlamentar e total por UF (R$)
                      </p>
                    </div>
                    <div className="chart-card-tools">
                      <SegmentedTabs
                        groupId="uf-tabs"
                        value={ufView}
                        label="Alternar visualização por UF"
                        options={UF_OPTIONS}
                        onChange={setUfView}
                      />
                      <MethodPopover
                        title="Comparabilidade entre estados"
                        body="Cada unidade federativa possui um teto mensal oficial distinto calculado pela distância aérea até Brasília. As barras usam escala linear exata da métrica ativa (maior valor = 100%). Compare médias dentro do contexto da legislação da Câmara."
                        sourceLabel="Ato da Mesa · CEAP"
                      />
                    </div>
                  </div>

                  <div className="chart-card-body">
                    <UfComparisonPanel
                      rows={ufRows}
                      selectedUf={selectedUf}
                      selectedAno={selectedAno}
                      viewMode={ufView}
                      onSelectUf={onSelectUf}
                    />
                  </div>
                </div>

                <div className="chart-footer-meta">
                  <span>Exibe somente UFs com coleta persistida em {selectedAno}</span>
                  <a
                    href="https://www2.camara.leg.br/transparencia/acesso-a-informacao/copy_of_perguntas-frequentes/cota-para-o-exercicio-da-atividade-parlamentar"
                    target="_blank"
                    rel="noreferrer"
                    className="chart-footer-link"
                  >
                    Tetos da CEAP por UF
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                </div>
              </article>
            </div>

            {analytics?.aviso_metodologico ? (
              <div className="banner" style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Info size={18} color="var(--status-info)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ margin: 0, color: 'var(--ink-secondary)', fontSize: '0.88rem' }}>
                    <strong style={{ color: 'var(--ink-primary)' }}>Nota metodológica: </strong>
                    {analytics.aviso_metodologico}
                  </p>
                </div>
              </div>
            ) : null}
          </AnimatedContent>
        )}
      </div>
    </section>
  );
}
