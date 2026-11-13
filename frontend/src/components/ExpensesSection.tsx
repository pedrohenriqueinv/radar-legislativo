import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, RotateCcw, Search } from 'lucide-react';
import { radarApi } from '../services/api';
import type { DeputadoCardOut, DespesasPageResponse, MetaResponse } from '../types/api';
import {
  formatBRL,
  formatDateBR,
  formatDocumentTaxId,
  formatInt,
  getMonthLabel,
  shortenCategory,
} from '../utils/format';
import { AnimatedContent } from './motion/AnimatedContent';

interface ExpensesSectionProps {
  meta: MetaResponse | null;
  selectedUf: string;
  selectedAno: number;
  deputados: DeputadoCardOut[];
  categoriasDisponiveis: string[];
  onChangeUf: (uf: string) => void;
  onChangeAno: (ano: number) => void;
  onOpenDeputy: (id: number) => void;
  refreshToken: number;
}

export function ExpensesSection({
  meta,
  selectedUf,
  selectedAno,
  deputados,
  categoriasDisponiveis,
  onChangeUf,
  onChangeAno,
  onOpenDeputy,
  refreshToken,
}: ExpensesSectionProps) {
  const [deputadoId, setDeputadoId] = useState<string>('');
  const [categoria, setCategoria] = useState<string>('');
  const [mes, setMes] = useState<string>('');
  const [buscaInput, setBuscaInput] = useState<string>('');
  const [buscaQuery, setBuscaQuery] = useState<string>('');
  const [ordenarPor, setOrdenarPor] = useState<'data_desc' | 'valor_desc' | 'valor_asc'>('data_desc');
  const [page, setPage] = useState<number>(1);
  const [data, setData] = useState<DespesasPageResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setDeputadoId('');
    setCategoria('');
    setMes('');
    setPage(1);
  }, [selectedUf, selectedAno]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setBuscaQuery(buscaInput.trim());
      setPage(1);
    }, 260);
    return () => window.clearTimeout(t);
  }, [buscaInput]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMsg(null);

    radarApi
      .getDespesas({
        uf: selectedUf,
        ano: selectedAno,
        deputado_id: deputadoId ? Number(deputadoId) : null,
        categoria: categoria || undefined,
        mes: mes ? Number(mes) : null,
        busca: buscaQuery || undefined,
        ordenar_por: ordenarPor,
        page,
        page_size: 20,
      })
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) {
          setErrorMsg(err instanceof Error ? err.message : 'Erro ao consultar despesas.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedUf, selectedAno, deputadoId, categoria, mes, buscaQuery, ordenarPor, page, refreshToken]);

  const csvUrl = radarApi.getDespesasCsvUrl({
    uf: selectedUf,
    ano: selectedAno,
    deputado_id: deputadoId ? Number(deputadoId) : null,
    categoria: categoria || undefined,
    mes: mes ? Number(mes) : null,
    busca: buscaQuery || undefined,
  });

  const resetFilters = () => {
    setDeputadoId('');
    setCategoria('');
    setMes('');
    setBuscaInput('');
    setBuscaQuery('');
    setOrdenarPor('data_desc');
    setPage(1);
  };

  return (
    <section id="despesas" className="page-section">
      <div className="container">
        <div className="section-header">
          <div>
            <h2 className="section-title">Despesas parlamentares registradas</h2>
            <p className="section-subtitle">
              Consulta granular com filtros combinados por estado, ano, deputado, categoria, mês e
              fornecedor, incluindo soma filtrada e acesso direto à nota fiscal oficial.
            </p>
          </div>

          <a href={csvUrl} className="btn btn-sm">
            <Download size={14} />
            Exportar recorte em CSV
          </a>
        </div>

        <div className="filter-bar">
          <select
            className="filter-select"
            aria-label="Filtrar despesas por UF"
            value={selectedUf}
            onChange={(e) => onChangeUf(e.target.value)}
          >
            {(meta?.ufs ?? []).map((u) => (
              <option key={u.uf} value={u.uf}>
                {u.uf} — {u.nome}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            aria-label="Filtrar despesas por ano"
            value={selectedAno}
            onChange={(e) => onChangeAno(Number(e.target.value))}
          >
            {(meta?.anos_suportados ?? [selectedAno]).map((ano) => (
              <option key={ano} value={ano}>
                {ano}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            aria-label="Filtrar despesas por deputado"
            value={deputadoId}
            onChange={(e) => {
              setDeputadoId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os deputados ({deputados.length})</option>
            {deputados.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome_parlamentar} ({d.partido ?? 'S/P'})
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            aria-label="Filtrar despesas por categoria"
            value={categoria}
            onChange={(e) => {
              setCategoria(e.target.value);
              setPage(1);
            }}
            style={{ maxWidth: 260 }}
          >
            <option value="">Todas as categorias</option>
            {categoriasDisponiveis.map((cat) => (
              <option key={cat} value={cat}>
                {shortenCategory(cat)}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            aria-label="Filtrar despesas por mês"
            value={mes}
            onChange={(e) => {
              setMes(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os meses</option>
            {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => (
              <option key={m} value={m}>
                {getMonthLabel(m)}
              </option>
            ))}
          </select>

          <div style={{ position: 'relative', flex: '1 1 210px', maxWidth: 300 }}>
            <Search
              size={14}
              color="var(--ink-muted)"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              aria-hidden="true"
            />
            <input
              id="despesas-search-input"
              type="search"
              className="input-field"
              style={{ width: '100%', paddingLeft: 32 }}
              placeholder="Fornecedor, CNPJ ou nº doc..."
              aria-label="Buscar por fornecedor, CNPJ ou número do documento"
              value={buscaInput}
              onChange={(e) => setBuscaInput(e.target.value)}
            />
          </div>

          <select
            className="filter-select"
            aria-label="Ordenar despesas"
            value={ordenarPor}
            onChange={(e) => {
              setOrdenarPor(e.target.value as 'data_desc' | 'valor_desc' | 'valor_asc');
              setPage(1);
            }}
          >
            <option value="data_desc">Mais recentes primeiro</option>
            <option value="valor_desc">Maior valor líquido</option>
            <option value="valor_asc">Menor valor / estornos</option>
          </select>

          {(deputadoId || categoria || mes || buscaInput) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>
              <RotateCcw size={13} />
              Limpar filtros
            </button>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
            fontSize: '0.88rem',
            color: 'var(--ink-secondary)',
          }}
        >
          <span className="tabular">
            {data
              ? `${formatInt(data.total)} lançamentos encontrados · Soma filtrada: `
              : 'Consultando lançamentos...'}
            {data && <strong style={{ color: 'var(--ink-primary)' }}>{formatBRL(data.soma_filtrada)}</strong>}
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
            Valores em R$ (BRL) · Fonte: Câmara dos Deputados
          </span>
        </div>

        {errorMsg && (
          <div className="banner banner--error" role="alert" style={{ marginBottom: 16 }}>
            <span>{errorMsg}</span>
          </div>
        )}

        <AnimatedContent>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Parlamentar</th>
                  <th>Categoria</th>
                  <th>Data</th>
                  <th>Fornecedor</th>
                  <th className="num-col">Valor líquido</th>
                  <th>Documento</th>
                  <th>Fonte</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx}>
                      <td colSpan={7}>
                        <div className="skeleton-block" style={{ height: 22, width: '100%' }} />
                      </td>
                    </tr>
                  ))
                ) : data && data.items.length > 0 ? (
                  data.items.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <button
                          type="button"
                          onClick={() => onOpenDeputy(row.deputado_id)}
                          style={{
                            background: 'transparent',
                            border: 0,
                            padding: 0,
                            color: 'var(--ink-primary)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          {row.deputado_nome}
                        </button>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                          {row.deputado_partido ?? 'S/P'} · {row.uf}
                        </div>
                      </td>
                      <td>
                        <span title={row.tipo_despesa}>{shortenCategory(row.tipo_despesa)}</span>
                      </td>
                      <td className="tabular">
                        {formatDateBR(row.data_documento)}
                        <div style={{ fontSize: '0.74rem', color: 'var(--ink-muted)' }}>
                          Comp. {String(row.mes).padStart(2, '0')}/{row.ano}
                        </div>
                      </td>
                      <td>
                        <div style={{ color: 'var(--ink-primary)' }}>{row.nome_fornecedor}</div>
                        <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--ink-muted)' }}>
                          {formatDocumentTaxId(row.cnpj_cpf_fornecedor)}
                        </div>
                      </td>
                      <td className="num-col">
                        <strong style={{ color: 'var(--ink-primary)' }}>
                          {formatBRL(row.valor_liquido)}
                        </strong>
                        {row.valor_liquido < 0 && <span className="credit-badge">Crédito/Estorno</span>}
                        {row.valor_glosa > 0 && (
                          <div style={{ fontSize: '0.73rem', color: 'var(--ink-muted)' }}>
                            Glosa: {formatBRL(row.valor_glosa)}
                          </div>
                        )}
                      </td>
                      <td>
                        {row.url_documento ? (
                          <a
                            href={row.url_documento}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <FileText size={13} />
                            {row.num_documento ? `Doc. ${row.num_documento}` : 'Abrir PDF'}
                          </a>
                        ) : (
                          <span style={{ color: 'var(--ink-dim)' }}>
                            {row.num_documento ? `Nº ${row.num_documento}` : 'Indisponível'}
                          </span>
                        )}
                      </td>
                      <td>
                        <a
                          href={row.fonte_url}
                          target="_blank"
                          rel="noreferrer"
                          title="Consultar endpoint oficial do parlamentar na API v2"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          API
                          <ExternalLink size={12} />
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 28 }}>
                      {data && !data.slice_has_data
                        ? `Nenhuma despesa carregada para ${selectedUf}/${selectedAno}.`
                        : 'Nenhum lançamento encontrado para os filtros aplicados.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </AnimatedContent>

        {data && data.total > 0 && (
          <div className="pagination-bar">
            <span className="tabular">
              Página {data.page} de {data.total_pages} · exibindo {data.items.length} de{' '}
              {formatInt(data.total)} lançamentos
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={data.page >= data.total_pages}
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
