import { memo, startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  Building2,
  Download,
  ExternalLink,
  FileText,
  UserRound,
  X,
} from 'lucide-react';
import { radarApi } from '../services/api';
import type {
  DeputadoCardOut,
  DeputadoDetailResponse,
  DespesaOut,
  DespesasPageResponse,
} from '../types/api';
import {
  formatBRL,
  formatBRLCompact,
  formatDateBR,
  formatDocumentTaxId,
  formatInt,
  formatPct,
  getMonthLabel,
  shortenCategory,
} from '../utils/format';
import { CeapUsageMeter } from './CeapUsageMeter';
import { AnimatedHBar } from './motion/InViewBar';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { Magnet } from './motion/Magnet';
import './DeputyDetailView.css';

const CONTRA_EASE: [number, number, number, number] = [0.48, 0.05, 0.35, 0.99];
const INSTANT_TRANSITION = { duration: 0 };

interface DeputyDetailViewProps {
  deputadoId: number;
  ano: number;
  ufContext: string;
  onBack: () => void;
  /** Optional slice peer list passed from App.tsx to compute exact rank & slice average without refetching */
  deputadosInSlice?: DeputadoCardOut[];
}

const ProfileExpenseRow = memo(function ProfileExpenseRow({ item }: { item: DespesaOut }) {
  return (
    <tr>
      <td className="tabular">{formatDateBR(item.data_documento)}</td>
      <td>{shortenCategory(item.tipo_despesa)}</td>
      <td>
        <div style={{ color: 'var(--ink-primary)' }}>{item.nome_fornecedor}</div>
        <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--ink-muted)' }}>
          {formatDocumentTaxId(item.cnpj_cpf_fornecedor)}
        </div>
      </td>
      <td className="num-col mono">
        {formatBRL(item.valor_liquido)}
        {item.valor_liquido < 0 ? <span className="credit-badge">Crédito/Estorno</span> : null}
      </td>
      <td>
        {item.url_documento ? (
          <a
            href={item.url_documento}
            target="_blank"
            rel="noreferrer"
            className="profile-doc-link"
          >
            <FileText size={13} />
            NF {item.num_documento ?? 'PDF'}
          </a>
        ) : (
          <span style={{ color: 'var(--ink-dim)' }}>Não anexado</span>
        )}
      </td>
    </tr>
  );
});

export function DeputyDetailView({
  deputadoId,
  ano,
  ufContext,
  onBack,
  deputadosInSlice,
}: DeputyDetailViewProps) {
  const shouldReduce = useReducedMotion();
  const [detail, setDetail] = useState<DeputadoDetailResponse | null>(null);
  const [fallbackPeers, setFallbackPeers] = useState<DeputadoCardOut[] | null>(null);
  const [expensesPage, setExpensesPage] = useState<DespesasPageResponse | null>(null);
  const [page, setPage] = useState(1);
  const [catFilter, setCatFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const hasPassedPeers = Boolean(deputadosInSlice && deputadosInSlice.length > 0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMsg(null);
    setImgFailed(false);
    setCatFilter('');
    setPage(1);

    const detailPromise = radarApi.getDeputadoDetail(deputadoId, { ano, uf: ufContext });
    const peersPromise = hasPassedPeers
      ? Promise.resolve<DeputadoCardOut[] | null>(null)
      : radarApi.getDeputados({ uf: ufContext, ano }).catch(() => null);

    Promise.all([detailPromise, peersPromise])
      .then(([res, peers]) => {
        if (!active) return;
        setDetail(res);
        if (peers) setFallbackPeers(peers);
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(err instanceof Error ? err.message : 'Erro ao carregar perfil do deputado.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [deputadoId, ano, ufContext, hasPassedPeers]);

  useEffect(() => {
    let active = true;
    radarApi
      .getDespesas({
        deputado_id: deputadoId,
        ano,
        categoria: catFilter || undefined,
        page,
        page_size: 15,
        ordenar_por: 'data_desc',
      })
      .then((res) => {
        if (active) setExpensesPage(res);
      })
      .catch(() => {
        // covered by parent error if detail failed
      });
    return () => {
      active = false;
    };
  }, [deputadoId, ano, catFilter, page]);

  const effectivePeers = useMemo(() => {
    if (deputadosInSlice && deputadosInSlice.length > 0) return deputadosInSlice;
    return fallbackPeers ?? [];
  }, [deputadosInSlice, fallbackPeers]);

  const peerStats = useMemo(() => {
    if (effectivePeers.length === 0) {
      return {
        rank: null as number | null,
        totalInSlice: null as number | null,
        sliceAverage: null as number | null,
        percentualNoRecorte: null as number | null,
      };
    }
    const sorted = [...effectivePeers].sort((a, b) => b.total_liquido - a.total_liquido);
    let sum = 0;
    let rank: number | null = null;
    let pct: number | null = null;
    for (let i = 0; i < sorted.length; i += 1) {
      const p = sorted[i];
      sum += p.total_liquido;
      if (p.id === deputadoId) {
        rank = i + 1;
        pct = p.percentual_no_recorte;
      }
    }
    return {
      rank,
      totalInSlice: sorted.length,
      sliceAverage: sorted.length > 0 ? sum / sorted.length : null,
      percentualNoRecorte: pct,
    };
  }, [effectivePeers, deputadoId]);

  const maxCat = useMemo(
    () => Math.max(...(detail?.categorias ?? []).map((c) => Math.abs(c.total_liquido)), 1),
    [detail]
  );

  const monthlyStats = useMemo(() => {
    const serie = detail?.serie_mensal ?? [];
    let maxMes = 1;
    let sumAtivos = 0;
    let countAtivos = 0;

    for (const m of serie) {
      const abs = Math.abs(m.total_liquido);
      if (abs > maxMes) maxMes = abs;
      if (m.qtd_lancamentos > 0) {
        sumAtivos += m.total_liquido;
        countAtivos += 1;
      }
    }

    const avgProfile = countAtivos > 0 ? sumAtivos / countAtivos : 0;
    const avgProfileRatio =
      avgProfile > 0 ? Math.min(0.95, Math.max(0.06, avgProfile / maxMes)) : 0;

    return { maxMes, avgProfile, avgProfileRatio };
  }, [detail]);

  const handleSelectCategory = useCallback((categoria: string | null) => {
    startTransition(() => {
      setCatFilter(categoria ?? '');
      setPage(1);
    });
  }, []);

  if (loading && !detail) {
    return (
      <section className="container profile-shell">
        <button type="button" className="btn btn-sm" onClick={onBack}>
          <ArrowLeft size={15} />
          Voltar para exploração
        </button>
        <div className="panel-card" style={{ marginTop: 20 }}>
          <div className="skeleton-block" style={{ height: 110, width: '100%' }} />
        </div>
      </section>
    );
  }

  if (errorMsg || !detail) {
    return (
      <section className="container profile-shell">
        <button type="button" className="btn btn-sm" onClick={onBack}>
          <ArrowLeft size={15} />
          Voltar para exploração
        </button>
        <div className="banner banner--error" style={{ marginTop: 20 }}>
          <div>
            <strong>Não foi possível abrir o perfil do parlamentar.</strong>
            <p style={{ margin: '4px 0 0' }}>{errorMsg ?? 'Registro não encontrado.'}</p>
          </div>
        </div>
      </section>
    );
  }

  const effectiveUf = detail.uf_referencia ?? detail.uf_atual ?? ufContext;

  return (
    <section
      className="container profile-shell"
      aria-label={`Perfil de ${detail.nome_parlamentar}`}
    >
      <div className="profile-topbar">
        <div className="profile-breadcrumb">
          <button type="button" className="btn btn-sm" onClick={onBack}>
            <ArrowLeft size={15} />
            Voltar ao recorte
          </button>
          <span aria-hidden="true">/</span>
          <span>
            {effectiveUf} · {detail.ano_referencia}
          </span>
          <span aria-hidden="true">/</span>
          <strong className="profile-breadcrumb__current">{detail.nome_parlamentar}</strong>
        </div>

        <Magnet magnetStrength={5}>
          <a
            href={detail.link_oficial}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary btn-sm"
          >
            Ver página oficial na Câmara
            <ExternalLink size={14} />
          </a>
        </Magnet>
      </div>

      <div className="profile-banner">
        <div className="profile-identity">
          {detail.url_foto && !imgFailed ? (
            <img
              src={detail.url_foto}
              alt={`Foto oficial de ${detail.nome_parlamentar}`}
              className="profile-photo"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="profile-photo profile-photo-placeholder" aria-hidden="true">
              <UserRound size={32} color="var(--ink-muted)" />
            </div>
          )}

          <div className="profile-identity-body">
            <h1 className="profile-heading-h1">{detail.nome_parlamentar}</h1>
            {detail.nome_civil ? (
              <p className="profile-civil-name">Nome civil: {detail.nome_civil}</p>
            ) : null}
            <div className="profile-meta-list">
              <span>
                Partido: <strong>{detail.partido_atual ?? 'N/D'}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                UF: <strong>{detail.uf_atual ?? detail.uf_referencia ?? 'N/D'}</strong>
              </span>
              {detail.situacao_atual ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Situação: <strong>{detail.situacao_atual}</strong>
                  </span>
                </>
              ) : null}
              {detail.condicao_eleitoral ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Condição: <strong>{detail.condicao_eleitoral}</strong>
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="profile-banner-actions">
          <a
            href={detail.fonte_oficial_url}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm"
          >
            JSON oficial da API
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      <div className="kpi-ledger">
        <div className="kpi-cell">
          <span className="kpi-label">Total líquido ({detail.ano_referencia})</span>
          <span className="kpi-value tabular">
            <AnimatedNumber
              value={detail.total_liquido}
              kind="brl"
              duration={0.68}
              animateOnMount={false}
            />
          </span>
          <span className="kpi-caption">Despesas consolidadas no ano selecionado</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Despesas registradas</span>
          <span className="kpi-value tabular">
            <AnimatedNumber
              value={detail.qtd_despesas}
              kind="int"
              duration={0.58}
              animateOnMount={false}
            />
          </span>
          <span className="kpi-caption">Documentos fiscais e bilhetes SIGEPA</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Glosas administrativas</span>
          <span className="kpi-value tabular">
            <AnimatedNumber
              value={detail.total_glosas}
              kind="brl"
              duration={0.58}
              animateOnMount={false}
            />
          </span>
          <span className="kpi-caption">Parcelas não ressarcidas pela Câmara</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Categorias utilizadas</span>
          <span className="kpi-value tabular">
            <AnimatedNumber
              value={detail.categorias.length}
              kind="int"
              duration={0.48}
              animateOnMount={false}
            />
          </span>
          <span className="kpi-caption">Entre as rubricas da cota CEAP</span>
        </div>
      </div>

      {/* Parte B.2: Multi-segmented CEAP Quota Usage Meter with rank pill & interactive legend */}
      <CeapUsageMeter
        variant="detailed"
        totalLiquido={detail.total_liquido}
        uf={effectiveUf}
        ano={detail.ano_referencia}
        categorias={detail.categorias}
        rank={peerStats.rank}
        totalInSlice={peerStats.totalInSlice}
        percentualNoRecorte={peerStats.percentualNoRecorte}
        sliceAverage={peerStats.sliceAverage}
        selectedCategory={catFilter || null}
        onSelectCategory={handleSelectCategory}
      />

      <div className="profile-grid-2">
        <div className="panel-card">
          <h2 className="profile-panel-title">
            Despesas por categoria ({detail.ano_referencia})
          </h2>
          <p className="profile-panel-sub">
            Valores líquidos em R$ · Fonte: API Dados Abertos da Câmara
          </p>
          {detail.categorias.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)' }}>Nenhuma despesa registrada neste ano.</p>
          ) : (
            <div className="hbar-list">
              {detail.categorias.map((c, idx) => (
                <div key={c.categoria} className="hbar-row">
                  <div className="hbar-meta">
                    <span className="hbar-name" title={c.categoria}>
                      {shortenCategory(c.categoria)}
                    </span>
                    <span className="hbar-values mono tabular">
                      {formatBRL(c.total_liquido)} ({formatPct(c.percentual)})
                    </span>
                  </div>
                  <AnimatedHBar
                    widthPct={Math.max(3, Math.round((Math.abs(c.total_liquido) / maxCat) * 100))}
                    delay={idx * 0.04}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel-card">
          <h2 className="profile-panel-title">Evolução mensal ({detail.ano_referencia})</h2>
          <p className="profile-panel-sub">
            Valores líquidos por mês de competência · Valores em R$
          </p>
          <div className="hero-bars-stage">
            {monthlyStats.avgProfile > 0 ? (
              <div
                className="avg-ref-line"
                style={{
                  bottom: `calc(24px + ${monthlyStats.avgProfileRatio.toFixed(4)} * (100% - 46px))`,
                }}
                aria-hidden="true"
              >
                <span className="avg-ref-badge tabular">
                  AVG · {formatBRLCompact(monthlyStats.avgProfile)}
                </span>
              </div>
            ) : null}

            <div className="hero-bars-grid" style={{ height: 152 }}>
              {detail.serie_mensal.map((m, idx) => {
                const h =
                  m.qtd_lancamentos > 0
                    ? Math.max(
                        8,
                        Math.round((Math.abs(m.total_liquido) / monthlyStats.maxMes) * 100)
                      )
                    : 4;
                return (
                  <div
                    key={m.mes}
                    className={`hero-bar-col ${m.qtd_lancamentos === 0 ? 'hero-bar-col--empty' : ''}`}
                    title={`${getMonthLabel(m.mes)}: ${formatBRL(m.total_liquido)} (${m.qtd_lancamentos} lançamentos)`}
                  >
                    <span className="hero-bar-track">
                      <motion.span
                        key={`${detail.id}-${detail.ano_referencia}-m-${m.mes}`}
                        className="hero-bar-fill"
                        initial={shouldReduce ? false : { scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={
                          shouldReduce
                            ? INSTANT_TRANSITION
                            : { duration: 0.48, delay: idx * 0.03, ease: CONTRA_EASE }
                        }
                        style={{ height: `${h}%` }}
                      />
                    </span>
                    <span className="hero-bar-label">{m.mes_nome}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="profile-grid-2">
        <div className="panel-card">
          <h2 className="profile-panel-title profile-panel-title--icon">
            <Building2 size={17} color="var(--accent-bright)" />
            Principais fornecedores ({detail.ano_referencia})
          </h2>
          {detail.principais_fornecedores.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)' }}>Nenhum fornecedor listado para este ano.</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fornecedor / CNPJ</th>
                    <th className="num-col">Notas</th>
                    <th className="num-col">Total líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.principais_fornecedores.map((f, idx) => (
                    <tr key={`${f.nome_fornecedor}-${idx}`}>
                      <td>
                        <div style={{ color: 'var(--ink-primary)', fontWeight: 500 }}>
                          {f.nome_fornecedor}
                        </div>
                        <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                          {formatDocumentTaxId(f.cnpj_cpf_fornecedor)}
                        </div>
                      </td>
                      <td className="num-col">{formatInt(f.qtd_lancamentos)}</td>
                      <td className="num-col mono">{formatBRL(f.total_liquido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel-card">
          <h2 className="profile-panel-title" style={{ marginBottom: 14 }}>
            Histórico de mandatos e alterações (/historico)
          </h2>
          {detail.historico_mandatos.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)' }}>Nenhum evento histórico armazenado.</p>
          ) : (
            <div className="table-scroll" style={{ maxHeight: 340 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Leg.</th>
                    <th>UF / Partido</th>
                    <th>Evento / Situação</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.historico_mandatos.slice(0, 12).map((h, i) => (
                    <tr key={`${h.id_legislatura}-${i}`}>
                      <td className="tabular">{h.id_legislatura}ª</td>
                      <td>
                        {h.sigla_uf} · {h.sigla_partido ?? '—'}
                      </td>
                      <td>
                        <div style={{ color: 'var(--ink-primary)' }}>{h.situacao ?? '—'}</div>
                        {h.descricao_status ? (
                          <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                            {h.descricao_status}
                          </div>
                        ) : null}
                      </td>
                      <td className="tabular">{formatDateBR(h.data_hora_evento)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="panel-card" style={{ marginTop: 24 }}>
        <div className="profile-expenses-head">
          <div>
            <h2 className="profile-panel-title">
              Lançamentos individuais de {detail.nome_parlamentar} ({detail.ano_referencia})
            </h2>
            <p className="profile-panel-sub" style={{ marginBottom: 0 }}>
              Inclui acesso ao documento fiscal oficial (DANFE/PDF) quando disponibilizado pela Câmara.
            </p>
          </div>

          <div className="profile-expenses-controls">
            {catFilter ? (
              <button
                type="button"
                className="profile-cat-filter-pill"
                onClick={() => handleSelectCategory(null)}
                title="Remover filtro de categoria"
              >
                {shortenCategory(catFilter)}
                <X size={12} aria-hidden="true" />
              </button>
            ) : null}

            <select
              className="filter-select"
              value={catFilter}
              aria-label="Filtrar lançamentos por categoria"
              onChange={(e) => handleSelectCategory(e.target.value || null)}
            >
              <option value="">Todas as categorias</option>
              {detail.categorias.map((c) => (
                <option key={c.categoria} value={c.categoria}>
                  {shortenCategory(c.categoria)}
                </option>
              ))}
            </select>

            <a
              href={radarApi.getDespesasCsvUrl({
                deputado_id: deputadoId,
                ano,
                categoria: catFilter || undefined,
              })}
              className="btn btn-sm"
            >
              <Download size={14} />
              Exportar CSV
            </a>
          </div>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Categoria</th>
                <th>Fornecedor</th>
                <th className="num-col">Valor líquido</th>
                <th>Documento</th>
              </tr>
            </thead>
            <tbody>
              {(expensesPage?.items ?? []).map((item) => (
                <ProfileExpenseRow key={item.id} item={item} />
              ))}
              {expensesPage && expensesPage.items.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>
                    Nenhum lançamento encontrado com esse filtro.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {expensesPage && expensesPage.total_pages > 1 ? (
          <div className="pagination-bar">
            <span>
              Página {expensesPage.page} de {expensesPage.total_pages} ·{' '}
              {formatInt(expensesPage.total)} registros
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={page <= 1}
                onClick={() => startTransition(() => setPage((p) => Math.max(1, p - 1)))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={page >= expensesPage.total_pages}
                onClick={() => startTransition(() => setPage((p) => p + 1))}
              >
                Próxima
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
