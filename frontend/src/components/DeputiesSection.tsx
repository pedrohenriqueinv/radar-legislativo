import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ExternalLink, Search, UserRound } from 'lucide-react';
import type { DeputadoCardOut } from '../types/api';
import { formatBRL, formatInt, formatPct } from '../utils/format';
import { AnimatedContent } from './motion/AnimatedContent';

const CONTRA_EASE: [number, number, number, number] = [0.48, 0.05, 0.35, 0.99];

interface DeputiesSectionProps {
  deputados: DeputadoCardOut[];
  loading: boolean;
  selectedUf: string;
  selectedAno: number;
  hasData: boolean;
  onOpenDeputy: (id: number) => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export function DeputiesSection({
  deputados,
  loading,
  selectedUf,
  selectedAno,
  hasData,
  onOpenDeputy,
}: DeputiesSectionProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPartido, setSelectedPartido] = useState('');
  const [sortBy, setSortBy] = useState<'total_desc' | 'nome_asc' | 'qtd_desc'>('total_desc');
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});

  const partidosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const d of deputados) {
      if (d.partido) set.add(d.partido);
    }
    return Array.from(set).sort();
  }, [deputados]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = deputados.filter((d) => {
      if (selectedPartido && d.partido !== selectedPartido) return false;
      if (q) {
        const hay = `${d.nome_parlamentar} ${d.nome_civil ?? ''} ${d.partido ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'nome_asc') {
        return a.nome_parlamentar.localeCompare(b.nome_parlamentar, 'pt-BR');
      }
      if (sortBy === 'qtd_desc') {
        return b.qtd_despesas - a.qtd_despesas;
      }
      return b.total_liquido - a.total_liquido;
    });
  }, [deputados, searchTerm, selectedPartido, sortBy]);

  return (
    <section id="parlamentares" className="page-section page-section--alt">
      <div className="container">
        <div className="section-header">
          <div>
            <h2 className="section-title">Parlamentares do recorte</h2>
            <p className="section-subtitle">
              Deputados associados a {selectedUf} nas legislaturas vigentes em {selectedAno}. Abra o
              perfil individual para analisar fornecedores, histórico de mandatos e notas fiscais.
            </p>
          </div>
        </div>

        <div className="filter-bar">
          <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
            <Search
              size={15}
              color="var(--ink-muted)"
              style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}
              aria-hidden="true"
            />
            <input
              type="search"
              className="input-field"
              style={{ width: '100%', paddingLeft: 34 }}
              placeholder="Buscar deputado por nome..."
              aria-label="Buscar deputado por nome"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="filter-select"
            aria-label="Filtrar por partido"
            value={selectedPartido}
            onChange={(e) => setSelectedPartido(e.target.value)}
          >
            <option value="">Todos os partidos ({partidosDisponiveis.length})</option>
            {partidosDisponiveis.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            aria-label="Ordenar parlamentares"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'total_desc' | 'nome_asc' | 'qtd_desc')}
          >
            <option value="total_desc">Maior volume líquido no recorte</option>
            <option value="qtd_desc">Mais lançamentos carregados</option>
            <option value="nome_asc">Ordem alfabética (A–Z)</option>
          </select>

          <span style={{ marginLeft: 'auto', fontSize: '0.84rem', color: 'var(--ink-muted)' }}>
            Exibindo {formatInt(filtered.length)} de {formatInt(deputados.length)}
          </span>
        </div>

        {loading && deputados.length === 0 ? (
          <div className="deputies-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="deputy-card">
                <div className="skeleton-block" style={{ height: 56, width: '100%' }} />
                <div className="skeleton-block" style={{ height: 42, width: '100%' }} />
              </div>
            ))}
          </div>
        ) : !hasData ? (
          <div className="panel-card" style={{ color: 'var(--ink-secondary)' }}>
            Nenhum parlamentar persistido ainda para {selectedUf}/{selectedAno}. Selecione outro
            estado carregado ou execute a coleta do recorte.
          </div>
        ) : filtered.length === 0 ? (
          <div className="panel-card" style={{ color: 'var(--ink-secondary)' }}>
            Nenhum parlamentar corresponde ao filtro aplicado ({searchTerm || selectedPartido}).
          </div>
        ) : (
          <AnimatedContent>
            <div className="deputies-grid">
              {filtered.map((dep) => {
                const showPhoto = Boolean(dep.url_foto) && !brokenImages[dep.id];
                return (
                  <motion.article
                    key={dep.id}
                    className="deputy-card"
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.18, ease: CONTRA_EASE }}
                  >
                    <div>
                      <div className="deputy-head">
                        {showPhoto ? (
                          <img
                            src={dep.url_foto!}
                            alt={`Foto oficial de ${dep.nome_parlamentar}`}
                            className="deputy-avatar"
                            loading="lazy"
                            onError={() =>
                              setBrokenImages((prev) => ({ ...prev, [dep.id]: true }))
                            }
                          />
                        ) : (
                          <div className="deputy-avatar-fallback" aria-hidden="true">
                            {dep.url_foto ? getInitials(dep.nome_parlamentar) : <UserRound size={22} />}
                          </div>
                        )}

                        <div style={{ minWidth: 0 }}>
                          <h3 className="deputy-name">{dep.nome_parlamentar}</h3>
                          <div className="deputy-meta-row">
                            <span>{dep.partido ?? 'Sem partido'}</span>
                            <span aria-hidden="true">·</span>
                            <span>{dep.uf}</span>
                            {dep.situacao_atual && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{dep.situacao_atual}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="deputy-metrics" style={{ marginTop: 14 }}>
                        <div>
                          <span className="deputy-metric-label">Total líquido ({selectedAno})</span>
                          <span className="deputy-metric-val tabular">
                            {formatBRL(dep.total_liquido)}
                          </span>
                        </div>
                        <div>
                          <span className="deputy-metric-label">Despesas carregadas</span>
                          <span className="deputy-metric-val tabular">
                            {formatInt(dep.qtd_despesas)}{' '}
                            <span style={{ fontSize: '0.78rem', fontWeight: 400, color: 'var(--ink-muted)' }}>
                              ({formatPct(dep.percentual_no_recorte)})
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="deputy-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => onOpenDeputy(dep.id)}
                      >
                        Abrir perfil
                        <ArrowRight size={14} />
                      </button>

                      <a
                        href={dep.link_oficial}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost btn-sm"
                      >
                        Portal Câmara
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </AnimatedContent>
        )}
      </div>
    </section>
  );
}
