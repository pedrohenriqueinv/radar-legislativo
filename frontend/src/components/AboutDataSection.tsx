import { BookOpen, Database, ExternalLink, ShieldCheck } from 'lucide-react';
import type { ExecucaoOut, HealthResponse, OverviewResponse } from '../types/api';
import { formatDateTimeBR, formatInt, getStatusMeta } from '../utils/format';
import { AnimatedContent } from './motion/AnimatedContent';

interface AboutDataSectionProps {
  overview: OverviewResponse | null;
  execucoes: ExecucaoOut[];
  health: HealthResponse | null;
}

export function AboutDataSection({ overview, execucoes, health }: AboutDataSectionProps) {
  return (
    <section id="sobre-dados" className="page-section">
      <div className="container">
        <div className="section-header">
          <div>
            <h2 className="section-title">Sobre os dados, metodologia e auditoria</h2>
            <p className="section-subtitle">
              Transparência completa sobre origem dos dados, pipeline de ingestão, regras de
              normalização adotadas e histórico de execuções registradas.
            </p>
          </div>
        </div>

        <AnimatedContent>
          <div className="about-grid">
            <article className="panel-card">
              <h3 style={{ margin: '0 0 12px', fontSize: '1.08rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Database size={17} color="var(--accent-bright)" />
                Fonte oficial e pipeline ETL
              </h3>
              <p style={{ margin: '0 0 10px', color: 'var(--ink-secondary)', fontSize: '0.92rem' }}>
                Os registros são coletados diretamente da{' '}
                <a
                  href="https://dadosabertos.camara.leg.br/swagger/api.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  API Dados Abertos da Câmara dos Deputados (v2)
                </a>
                . Para cada combinação de UF e ano, o pipeline mapeia automaticamente as
                legislaturas vigentes no ano via <code className="mono">/legislaturas</code>, consulta
                os deputados daquela UF com paginação automática pelos links <code className="mono">next</code> e
                carrega histórico de mandatos e todas as páginas de despesas (<code className="mono">itens=100</code>).
              </p>
              <p style={{ margin: 0, color: 'var(--ink-secondary)', fontSize: '0.92rem' }}>
                Cada despesa passa por limpeza textual, parsing de datas, deduplicação por chave
                SHA-256 idempotente (tratando <code className="mono">codDocumento=0</code> e múltiplos trechos
                aéreos) e upsert relacional preservando execuções válidas anteriores em caso de falha
                parcial.
              </p>
            </article>

            <article className="panel-card">
              <h3 style={{ margin: '0 0 12px', fontSize: '1.08rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={17} color="var(--accent-bright)" />
                Significado da CEAP, normalização e limitações
              </h3>
              <p style={{ margin: '0 0 10px', color: 'var(--ink-secondary)', fontSize: '0.92rem' }}>
                As despesas exibidas pertencem à{' '}
                <strong>Cota para o Exercício da Atividade Parlamentar (CEAP)</strong> — verba
                pública destinada a custear passagens, escritório, combustíveis e divulgação.{' '}
                <strong>Um gasto registrado não representa irregularidade ou ilícito.</strong> Os
                limites mensais variam por UF conforme distância de Brasília e exercício do mandato.
              </p>
              <p style={{ margin: 0, color: 'var(--ink-secondary)', fontSize: '0.92rem' }}>
                <strong>Decisão técnica verificada na API:</strong> endpoints de despesas fora de
                SIGEPA retornam <code className="mono">valorLiquido</code> negativo mesmo com documento positivo;
                o pipeline normaliza o valor líquido (<code className="mono">valorDocumento - valorGlosa</code>)
                mantendo <code className="mono">valor_liquido_api_raw</code> intacto e preservando
                créditos/estornos negativos genuínos (SIGEPA). Documentos digitais podem ainda estar
                pendentes de digitalização na fonte para meses recentes.
              </p>
            </article>
          </div>

          <div className="panel-card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <BookOpen size={16} color="var(--accent-bright)" />
                Ambiente atual e documentação oficial
              </h3>
              <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                Backend ativo: {health?.storage_label ?? 'Carregando...'} · Recorte atual: {overview?.uf ?? '—'}/{overview?.ano ?? '—'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: '0.88rem' }}>
              <a
                href="https://dadosabertos.camara.leg.br/swagger/api.html"
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm"
              >
                Swagger API Câmara v2
                <ExternalLink size={13} />
              </a>
              <a
                href="https://www2.camara.leg.br/transparencia/acesso-a-informacao/copy_of_perguntas-frequentes/cota-para-o-exercicio-da-atividade-parlamentar"
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm"
              >
                Regras oficiais da Cota Parlamentar
                <ExternalLink size={13} />
              </a>
              <a
                href="https://www.camara.leg.br/cota-parlamentar/"
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm"
              >
                Portal da Cota Parlamentar
                <ExternalLink size={13} />
              </a>
            </div>
          </div>

          <div className="panel-card">
            <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>
              Histórico de execuções do pipeline (<code className="mono">coleta_execucoes</code>)
            </h3>
            {execucoes.length === 0 ? (
              <p style={{ color: 'var(--ink-muted)', margin: 0 }}>
                Nenhuma execução registrada no banco até o momento.
              </p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Execução</th>
                      <th>Recorte</th>
                      <th>Status</th>
                      <th>Legislaturas</th>
                      <th className="num-col">Deputados</th>
                      <th className="num-col">Despesas (novas / atualiz.)</th>
                      <th>Finalizado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {execucoes.map((ex) => {
                      const st = getStatusMeta(ex.status);
                      return (
                        <tr key={ex.id}>
                          <td className="mono">#{ex.id}</td>
                          <td>
                            <strong>{ex.uf}</strong> · {ex.ano}
                          </td>
                          <td>
                            <span className={`status-pill status-pill--${st.tone}`}>
                              {st.label}
                            </span>
                            {ex.resumo_erros && (
                              <div style={{ fontSize: '0.74rem', color: 'var(--status-warn)', marginTop: 4 }}>
                                {ex.resumo_erros}
                              </div>
                            )}
                          </td>
                          <td className="tabular">{ex.legislaturas_consultadas.join(', ') || '—'}</td>
                          <td className="num-col">
                            {formatInt(ex.deputados_processados)} / {formatInt(ex.deputados_esperados)}
                            {ex.deputados_com_erro > 0 && ` (${ex.deputados_com_erro} erro)`}
                          </td>
                          <td className="num-col">
                            {formatInt(ex.despesas_coletadas)} ({formatInt(ex.despesas_inseridas)} /{' '}
                            {formatInt(ex.despesas_atualizadas)})
                          </td>
                          <td className="tabular">
                            {ex.finalizado_em ? formatDateTimeBR(ex.finalizado_em) : 'Em execução...'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </AnimatedContent>
      </div>
    </section>
  );
}
