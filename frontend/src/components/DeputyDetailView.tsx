import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Building2, Download, ExternalLink, FileText, UserRound } from 'lucide-react';
import { radarApi } from '../services/api';
import type { DeputadoDetailResponse, DespesasPageResponse } from '../types/api';
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
import { AnimatedHBar } from './motion/InViewBar';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { Magnet } from './motion/Magnet';

const CONTRA_EASE: [number, number, number, number] = [0.48, 0.05, 0.35, 0.99];

interface DeputyDetailViewProps {
  deputadoId: number;
  ano: number;
  ufContext: string;
  onBack: () => void;
}

export function DeputyDetailView({
  deputadoId,
  ano,
  ufContext,
  onBack,
}: DeputyDetailViewProps) {
  const [detail, setDetail] = useState<DeputadoDetailResponse | null>(null);
  const [expensesPage, setExpensesPage] = useState<DespesasPageResponse | null>(null);
  const [page, setPage] = useState(1);
  const [catFilter, setCatFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMsg(null);
    setImgFailed(false);

    radarApi
      .getDeputadoDetail(deputadoId, { ano, uf: ufContext })
      .then((res) => {
        if (!active) return;
        setDetail(res);
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
  }, [deputadoId, ano, ufContext]);

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

  const maxCat = useMemo(
    () => Math.max(...(detail?.categorias ?? []).map((c) => Math.abs(c.total_liquido)), 1),
    [detail]
  );

  const maxMes = useMemo(
    () => Math.max(...(detail?.serie_mensal ?? []).map((m) => Math.abs(m.total_liquido)), 1),
    [detail]
  );

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

  return (
    <section className="container profile-shell" aria-label={`Perfil de ${detail.nome_parlamentar}`}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.86rem', color: 'var(--ink-muted)' }}>
          <button type="button" className="btn btn-sm" onClick={onBack}>
            <ArrowLeft size={15} />
            Voltar ao recorte
          </button>
          <span>/</span>
          <span>{detail.uf_referencia ?? detail.uf_atual ?? ufContext} · {detail.ano_referencia}</span>
          <span>/</span>
          <strong style={{ color: 'var(--ink-primary)' }}>{detail.nome_parlamentar}</strong>
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
            <div className="profile-photo" style={{ display: 'grid', placeItems: 'center' }}>
              <UserRound size={32} color="var(--ink-muted)" />
            </div>
          )}

          <div>
            <h1 style={{ margin: 0, fontSize: 'clamp(1.6rem, 3vw, 2.3rem)', lineHeight: 1.1 }}>
              {detail.nome_parlamentar}
            </h1>
            {detail.nome_civil && (
              <p style={{ margin: '4px 0 6px', color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
                Nome civil: {detail.nome_civil}
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: '0.86rem', color: 'var(--ink-secondary)' }}>
              <span>Partido: <strong>{detail.partido_atual ?? 'N/D'}</strong></span>
              <span>·</span>
              <span>UF: <strong>{detail.uf_atual ?? detail.uf_referencia ?? 'N/D'}</strong></span>
              {detail.situacao_atual && (
                <>
                  <span>·</span>
                  <span>Situação: <strong>{detail.situacao_atual}</strong></span>
                </>
              )}
              {detail.condicao_eleitoral && (
                <>
                  <span>·</span>
                  <span>Condição: <strong>{detail.condicao_eleitoral}</strong></span>
                </>
              )}
            </div>
          </div>
        </div>

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

      <div className="kpi-ledger">
        <div className="kpi-cell">
          <span className="kpi-label">Total líquido ({detail.ano_referencia})</span>
          <span className="kpi-value tabular">
            <AnimatedNumber value={detail.total_liquido} kind="brl" duration={0.68} />
          </span>
          <span className="kpi-caption">Despesas consolidadas no ano selecionado</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Despesas registradas</span>
          <span className="kpi-value tabular">
            <AnimatedNumber value={detail.qtd_despesas} kind="int" duration={0.58} />
          </span>
          <span className="kpi-caption">Documentos fiscais e bilhetes SIGEPA</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Glosas administrativas</span>
          <span className="kpi-value tabular">
            <AnimatedNumber value={detail.total_glosas} kind="brl" duration={0.58} />
          </span>
          <span className="kpi-caption">Parcelas não ressarcidas pela Câmara</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Categorias utilizadas</span>
          <span className="kpi-value tabular">
            <AnimatedNumber value={detail.categorias.length} kind="int" duration={0.48} />
          </span>
          <span className="kpi-caption">Entre as rubricas da cota CEAP</span>
        </div>
      </div>

      <div className="profile-grid-2">
        <div className="panel-card">
          <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>
            Despesas por categoria ({detail.ano_referencia})
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
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
                    <span className="hbar-values tabular">
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
          <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>
            Evolução mensal ({detail.ano_referencia})
          </h2>
          <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
            Valores líquidos por mês de competência · Valores em R$
          </p>
          {(() => {
            const ativos = detail.serie_mensal.filter((m) => m.qtd_lancamentos > 0);
            const avgProfile =
              ativos.length > 0
                ? ativos.reduce((acc, m) => acc + m.total_liquido, 0) / ativos.length
                : 0;
            const avgProfileRatio =
              avgProfile > 0 ? Math.min(0.95, Math.max(0.06, avgProfile / maxMes)) : 0;

            return (
              <div className="hero-bars-stage">
                {avgProfile > 0 && (
                  <div
                    className="avg-ref-line"
                    style={{ bottom: `calc(24px + ${avgProfileRatio.toFixed(4)} * (100% - 46px))` }}
                    aria-hidden="true"
                  >
                    <span className="avg-ref-badge tabular">
                      AVG · {formatBRLCompact(avgProfile)}
                    </span>
                  </div>
                )}

                <div className="hero-bars-grid" style={{ height: 152 }}>
                  {detail.serie_mensal.map((m, idx) => {
                    const h =
                      m.qtd_lancamentos > 0
                        ? Math.max(8, Math.round((Math.abs(m.total_liquido) / maxMes) * 100))
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
                            initial={{ scaleY: 0 }}
                            animate={{ scaleY: 1 }}
                            transition={{ duration: 0.48, delay: idx * 0.03, ease: CONTRA_EASE }}
                            style={{ height: `${h}%` }}
                          />
                        </span>
                        <span className="hero-bar-label">{m.mes_nome}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="profile-grid-2">
        <div className="panel-card">
          <h2 style={{ margin: '0 0 14px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
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
                      <td className="num-col">{formatBRL(f.total_liquido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel-card">
          <h2 style={{ margin: '0 0 14px', fontSize: '1.1rem' }}>
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
                        {h.descricao_status && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                            {h.descricao_status}
                          </div>
                        )}
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
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
              Lançamentos individuais de {detail.nome_parlamentar} ({detail.ano_referencia})
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
              Inclui acesso ao documento fiscal oficial (DANFE/PDF) quando disponibilizado pela Câmara.
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <select
              className="filter-select"
              value={catFilter}
              aria-label="Filtrar lançamentos por categoria"
              onChange={(e) => {
                setCatFilter(e.target.value);
                setPage(1);
              }}
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
                <tr key={item.id}>
                  <td className="tabular">{formatDateBR(item.data_documento)}</td>
                  <td>{shortenCategory(item.tipo_despesa)}</td>
                  <td>
                    <div style={{ color: 'var(--ink-primary)' }}>{item.nome_fornecedor}</div>
                    <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--ink-muted)' }}>
                      {formatDocumentTaxId(item.cnpj_cpf_fornecedor)}
                    </div>
                  </td>
                  <td className="num-col">
                    {formatBRL(item.valor_liquido)}
                    {item.valor_liquido < 0 && <span className="credit-badge">Crédito/Estorno</span>}
                  </td>
                  <td>
                    {item.url_documento ? (
                      <a
                        href={item.url_documento}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <FileText size={13} />
                        NF {item.num_documento ?? 'PDF'}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--ink-dim)' }}>Não anexado</span>
                    )}
                  </td>
                </tr>
              ))}
              {expensesPage && expensesPage.items.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>
                    Nenhum lançamento encontrado com esse filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {expensesPage && expensesPage.total_pages > 1 && (
          <div className="pagination-bar">
            <span>
              Página {expensesPage.page} de {expensesPage.total_pages} · {formatInt(expensesPage.total)} registros
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={page >= expensesPage.total_pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
