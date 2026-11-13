import { AlertTriangle, Clock, Database, RefreshCw, XCircle } from 'lucide-react';
import type { HealthResponse, MetaResponse, OverviewResponse } from '../types/api';
import {
  formatBRL,
  formatDateTimeBR,
  formatInt,
  getStatusMeta,
  shortenCategory,
} from '../utils/format';
import { AnimatedContent } from './motion/AnimatedContent';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { MethodPopover } from './motion/MethodPopover';

interface OverviewSectionProps {
  overview: OverviewResponse | null;
  meta: MetaResponse | null;
  health: HealthResponse | null;
  selectedAno: number;
  onChangeAno: (ano: number) => void;
  loading: boolean;
  dbError: { message: string; detail: string | null } | null;
  onRetry: () => void;
  onOpenCollectionModal: () => void;
}

export function OverviewSection({
  overview,
  meta,
  health,
  selectedAno,
  onChangeAno,
  loading,
  dbError,
  onRetry,
  onOpenCollectionModal,
}: OverviewSectionProps) {
  const statusInfo = getStatusMeta(overview?.situacao_coleta ?? 'nao_coletado');
  const isPreviewStorage = (health?.storage_backend ?? meta?.storage_backend) === 'preview_sqlite';
  const storageLabel =
    health?.storage_label ?? meta?.storage_label ?? 'Verificando armazenamento';

  return (
    <section id="visao-geral" className="page-section page-section--alt">
      <div className="container">
        <div className="section-header">
          <div>
            <h2 className="section-title">Visão geral do recorte</h2>
            <p className="section-subtitle">
              Síntese operacional e financeira das despesas parlamentares persistidas para o estado
              e ano selecionados, com sinalização explícita de integridade e atualização.
            </p>
          </div>

          <div className="overview-header-actions">
            <span
              className={`storage-badge ${isPreviewStorage ? 'storage-badge--preview' : ''}`}
              title={
                isPreviewStorage
                  ? 'Armazenamento local SQLite ativo com dados reais da Câmara; schema PostgreSQL 18 disponível em db/schema.sql'
                  : 'Conectado ao banco PostgreSQL'
              }
            >
              <Database size={12} />
              {storageLabel}
            </span>

            <div className="select-pill">
              <label htmlFor="overview-ano-select">Ano</label>
              <select
                id="overview-ano-select"
                value={selectedAno}
                onChange={(e) => onChangeAno(Number(e.target.value))}
                aria-label="Selecionar ano de referência"
              >
                {(meta?.anos_suportados ?? [2025, 2024, 2023, 2022]).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <button type="button" className="btn btn-sm" onClick={onOpenCollectionModal}>
              <RefreshCw size={13} />
              Coletar recorte
            </button>
          </div>
        </div>

        {dbError && (
          <div className="banner banner--error" role="alert" style={{ marginBottom: 20 }}>
            <div>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <XCircle size={17} />
                Indisponibilidade de banco de dados
              </strong>
              <p style={{ margin: '6px 0 0', color: 'var(--ink-secondary)' }}>
                {dbError.message}
              </p>
              {dbError.detail && (
                <p className="mono" style={{ margin: '6px 0 0', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                  Detalhe técnico: {dbError.detail}
                </p>
              )}
            </div>
            <button type="button" className="btn btn-sm" onClick={onRetry}>
              <RefreshCw size={14} />
              Tentar novamente
            </button>
          </div>
        )}

        {overview?.situacao_coleta === 'em_andamento' && (
          <div className="banner banner--info" role="status" style={{ marginBottom: 20 }}>
            <div>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Clock size={17} />
                Coleta em andamento para {overview.uf}/{overview.ano}
              </strong>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-secondary)' }}>
                O pipeline está consultando a API oficial página por página. Esta tela será
                atualizada automaticamente ao término.
              </p>
            </div>
          </div>
        )}

        {overview?.situacao_coleta === 'parcial' && (
          <div className="banner banner--warn" role="status" style={{ marginBottom: 20 }}>
            <div>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={17} />
                Recorte com coleta parcial
              </strong>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-secondary)' }}>
                {overview.nota_integridade}
              </p>
            </div>
            <button type="button" className="btn btn-sm" onClick={onOpenCollectionModal}>
              Reprocessar {overview.uf}/{overview.ano}
            </button>
          </div>
        )}

        {overview?.situacao_coleta === 'falhou' && (
          <div className="banner banner--error" role="alert" style={{ marginBottom: 20 }}>
            <div>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <XCircle size={17} />
                Falha registrada na última tentativa de coleta
              </strong>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-secondary)' }}>
                {overview.nota_integridade}
              </p>
            </div>
            <button type="button" className="btn btn-sm" onClick={onOpenCollectionModal}>
              Tentar coleta novamente
            </button>
          </div>
        )}

        {overview?.is_stale && overview.situacao_coleta !== 'nao_coletado' && (
          <div className="banner banner--warn" role="status" style={{ marginBottom: 20 }}>
            <div>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={17} />
                Dados desatualizados ({overview.dias_desde_atualizacao} dias desde a última coleta)
              </strong>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-secondary)' }}>
                Recomenda-se executar uma nova coleta para incorporar retificações recentes publicadas
                pela Câmara dos Deputados.
              </p>
            </div>
            <button type="button" className="btn btn-sm" onClick={onOpenCollectionModal}>
              Atualizar agora
            </button>
          </div>
        )}

        <AnimatedContent>
          <div className="kpi-ledger">
            <div className="kpi-cell">
              <span className="kpi-label">Recorte selecionado</span>
              {loading && !overview ? (
                <div className="skeleton-block" style={{ height: 32, width: '65%' }} />
              ) : (
                <span className="kpi-value tabular">
                  {overview ? `${overview.uf} · ${overview.ano}` : '—'}
                </span>
              )}
              <span className="kpi-caption">
                {overview
                  ? `${overview.uf_nome} (${overview.uf_regiao}) · ${
                      overview.legislaturas.length > 0
                        ? `Leg. ${overview.legislaturas.join(', ')}`
                        : 'Sem legislatura carregada'
                    }`
                  : 'Aguardando seleção'}
              </span>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">Situação e atualização</span>
              {loading && !overview ? (
                <div className="skeleton-block" style={{ height: 32, width: '75%' }} />
              ) : (
                <span
                  className="kpi-value"
                  style={{
                    fontSize: '1.35rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {overview?.situacao_coleta === 'completa' && (
                    <span className="kpi-status-mark" aria-hidden="true" />
                  )}
                  {statusInfo.label}
                </span>
              )}
              <span className="kpi-caption">
                Atualizado em: {formatDateTimeBR(overview?.ultima_atualizacao)}
              </span>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">Parlamentares no recorte</span>
              {loading && !overview ? (
                <div className="skeleton-block" style={{ height: 32, width: '45%' }} />
              ) : (
                <span className="kpi-value tabular">
                  <AnimatedNumber value={overview?.qtd_deputados ?? 0} kind="int" duration={0.62} />
                </span>
              )}
              <span className="kpi-caption">
                {overview?.has_data
                  ? `${formatInt(overview.qtd_deputados_com_despesas)} com lançamentos no período`
                  : 'Nenhum deputado coletado neste recorte'}
              </span>
            </div>

            <div className="kpi-cell">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span className="kpi-label">Soma líquida e cobertura</span>
                <MethodPopover
                  title="Cálculo da soma líquida e cobertura"
                  body="Soma todos os valores líquidos lançados pelos deputados do estado e ano selecionados. Lançamentos negativos representam estornos ou créditos compensados (SIGEPA) publicados pela Câmara."
                  sourceLabel="Cota Parlamentar (CEAP)"
                />
              </div>
              {loading && !overview ? (
                <div className="skeleton-block" style={{ height: 32, width: '80%' }} />
              ) : (
                <span className="kpi-value tabular">
                  {overview?.has_data ? (
                    <AnimatedNumber value={overview.total_liquido} kind="brl" duration={0.72} />
                  ) : (
                    'Sem dados'
                  )}
                </span>
              )}
              <span className="kpi-caption tabular">
                {overview?.has_data
                  ? `${formatInt(overview.qtd_despesas)} despesas · ${formatInt(overview.qtd_categorias)} categorias · ${formatBRL(overview.total_glosas)} glosados`
                  : 'Execute a coleta para consultar valores oficiais'}
              </span>
            </div>
          </div>
        </AnimatedContent>

        {overview && overview.categorias_disponiveis.length > 0 && (
          <div className="overview-categories-strip">
            <span className="overview-categories-label">
              Categorias presentes no recorte ({overview.categorias_disponiveis.length}):
            </span>
            <div className="overview-categories-pills">
              {overview.categorias_disponiveis.map((cat) => (
                <span key={cat} className="category-pill" title={cat}>
                  {shortenCategory(cat)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
