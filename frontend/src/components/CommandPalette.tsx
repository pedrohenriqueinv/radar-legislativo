import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Compass,
  Download,
  FileSearch,
  MapPin,
  RefreshCw,
  Search,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import type { DeputadoCardOut, MetaResponse } from '../types/api';
import { BRAZIL_TILE_GRID, formatBRLCompact, formatInt } from '../utils/format';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  meta: MetaResponse | null;
  deputados: DeputadoCardOut[];
  selectedUf: string;
  selectedAno: number;
  onSelectUf: (uf: string) => void;
  onOpenDeputy: (id: number) => void;
  onNavigateSection: (sectionId: string) => void;
  onJumpToExpenses: (query?: string) => void;
  onOpenCollectionModal: () => void;
  onExportCsv: () => void;
}

type CommandGroupId = 'expenses' | 'deputies' | 'ufs' | 'sections' | 'actions';

interface CommandItem {
  id: string;
  group: CommandGroupId;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: { label: string; tone: 'active' | 'ok' | 'muted' };
  icon: ReactNode;
  avatarUrl?: string | null;
  initials?: string;
  onSelect: () => void;
}

const GROUP_LABELS: Record<CommandGroupId, string> = {
  expenses: 'Busca direta em despesas',
  deputies: 'Parlamentares no recorte',
  ufs: 'Unidades federativas (27 UFs)',
  sections: 'Seções do painel',
  actions: 'Ações rápidas',
};

const SECTION_COMMANDS = [
  { id: 'visao-geral', title: 'Visão Geral', subtitle: 'KPIs, integridade e categorias do recorte', keywords: 'visao geral kpi resumo total' },
  { id: 'estados', title: 'Estados', subtitle: 'Exploração por região e unidade federativa', keywords: 'estados uf regiao mapa brasil' },
  { id: 'parlamentares', title: 'Parlamentares', subtitle: 'Lista, ranking e uso da cota dos deputados', keywords: 'parlamentares deputados ranking cota' },
  { id: 'despesas', title: 'Despesas', subtitle: 'Tabela filtrável de notas fiscais e fornecedores', keywords: 'despesas notas fornecedores cnpj tabela' },
  { id: 'analises', title: 'Análises', subtitle: 'Evolução mensal, categorias, dispersão e UFs', keywords: 'analises graficos donut hexbin comparacao' },
  { id: 'sobre-dados', title: 'Auditoria & Sobre os dados', subtitle: 'Metodologia, fonte oficial e histórico de execuções', keywords: 'auditoria sobre dados metodologia execucoes etl' },
] as const;

const PANEL_SPRING = {
  type: 'spring' as const,
  stiffness: 430,
  damping: 34,
  mass: 0.78,
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return (parts[0] ?? 'DP').slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export const CommandPalette = memo(function CommandPalette({
  open,
  onClose,
  meta,
  deputados,
  selectedUf,
  selectedAno,
  onSelectUf,
  onOpenDeputy,
  onNavigateSection,
  onJumpToExpenses,
  onOpenCollectionModal,
  onExportCsv,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      const raf = window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(raf);
    }
  }, [open]);

  // Lock background scroll cleanly while palette is open
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const ufSummaryMap = useMemo(() => {
    const map = new Map<string, NonNullable<MetaResponse>['ufs'][number]>();
    for (const item of meta?.ufs ?? []) {
      map.set(item.uf, item);
    }
    return map;
  }, [meta]);

  const trimmedQuery = deferredQuery.trim();
  const normQuery = useMemo(() => normalizeText(trimmedQuery), [trimmedQuery]);

  const items = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [];

    // 1. Direct expense query jump when user types 2+ chars
    if (trimmedQuery.length >= 2) {
      list.push({
        id: `expense-jump-${trimmedQuery}`,
        group: 'expenses',
        title: `Buscar "${trimmedQuery}" em Despesas`,
        subtitle: `Ir para #despesas filtrando fornecedor, CNPJ ou descrição em ${selectedUf}/${selectedAno}`,
        icon: <FileSearch size={16} />,
        onSelect: () => {
          onClose();
          onJumpToExpenses(trimmedQuery);
        },
      });
    }

    // 2. Loaded deputies in active cut
    const matchingDeputies = normQuery
      ? deputados.filter((d) => {
          const hay = normalizeText(
            `${d.nome_parlamentar} ${d.nome_civil ?? ''} ${d.partido ?? ''} ${d.uf}`
          );
          return hay.includes(normQuery);
        })
      : deputados;

    const deputySlice = matchingDeputies.slice(0, normQuery ? 8 : 5);
    for (const dep of deputySlice) {
      list.push({
        id: `dep-${dep.id}`,
        group: 'deputies',
        title: dep.nome_parlamentar,
        subtitle: `${dep.partido ?? 'S/P'} · ${dep.uf} · ${formatInt(dep.qtd_despesas)} lançamentos`,
        meta: formatBRLCompact(dep.total_liquido),
        icon: <UserRound size={15} />,
        avatarUrl: dep.url_foto,
        initials: getInitials(dep.nome_parlamentar),
        onSelect: () => {
          onClose();
          onOpenDeputy(dep.id);
        },
      });
    }

    // 3. All 27 UFs (sorted: exact code match -> active -> collected -> alpha)
    const matchingUfs = BRAZIL_TILE_GRID.filter((tile) => {
      if (!normQuery) return true;
      const hay = normalizeText(`${tile.uf} ${tile.nome} ${tile.regiao}`);
      return hay.includes(normQuery);
    }).sort((a, b) => {
      if (normQuery) {
        const aExact = a.uf.toLowerCase() === normQuery ? 1 : 0;
        const bExact = b.uf.toLowerCase() === normQuery ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
      }
      const aCol = ufSummaryMap.get(a.uf)?.anos_disponiveis.includes(selectedAno) ? 1 : 0;
      const bCol = ufSummaryMap.get(b.uf)?.anos_disponiveis.includes(selectedAno) ? 1 : 0;
      if (a.uf === selectedUf) return -1;
      if (b.uf === selectedUf) return 1;
      if (aCol !== bCol) return bCol - aCol;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });

    const ufLimit = normQuery ? 27 : 8;
    for (const tile of matchingUfs.slice(0, ufLimit)) {
      const summary = ufSummaryMap.get(tile.uf);
      const isCollected = summary?.anos_disponiveis.includes(selectedAno) ?? false;
      const isActive = tile.uf === selectedUf;
      const altYears = summary?.anos_disponiveis ?? [];

      list.push({
        id: `uf-${tile.uf}`,
        group: 'ufs',
        title: `${tile.uf} — ${tile.nome}`,
        subtitle: isCollected
          ? `${tile.regiao} · ${formatInt(summary?.total_deputados_carregados ?? 0)} parlamentares em ${selectedAno}`
          : altYears.length > 0
            ? `${tile.regiao} · disponível em ${altYears.join(', ')}`
            : `${tile.regiao} · sem coleta em ${selectedAno}`,
        badge: isActive
          ? { label: 'Ativa', tone: 'active' }
          : isCollected
            ? { label: 'Coletada', tone: 'ok' }
            : { label: 'Não coletada', tone: 'muted' },
        icon: <MapPin size={15} />,
        onSelect: () => {
          onClose();
          onSelectUf(tile.uf);
        },
      });
    }

    // 4. Sections
    const matchingSections = SECTION_COMMANDS.filter((sec) => {
      if (!normQuery) return true;
      return normalizeText(`${sec.title} ${sec.subtitle} ${sec.keywords}`).includes(normQuery);
    });

    for (const sec of matchingSections) {
      const sectionIcon =
        sec.id === 'analises' ? (
          <BarChart3 size={15} />
        ) : sec.id === 'parlamentares' ? (
          <Users size={15} />
        ) : sec.id === 'sobre-dados' ? (
          <BookOpen size={15} />
        ) : (
          <Compass size={15} />
        );

      list.push({
        id: `sec-${sec.id}`,
        group: 'sections',
        title: sec.title,
        subtitle: sec.subtitle,
        icon: sectionIcon,
        onSelect: () => {
          onClose();
          onNavigateSection(sec.id);
        },
      });
    }

    // 5. Quick actions
    const actionCandidates: Array<{
      id: string;
      title: string;
      subtitle: string;
      keywords: string;
      icon: ReactNode;
      onSelect: () => void;
    }> = [
      {
        id: 'act-collect',
        title: `Coletar novo recorte (${selectedUf}/${selectedAno})`,
        subtitle: 'Abrir diálogo de coleta oficial na API da Câmara',
        keywords: 'coletar atualizar sincronizar api camara',
        icon: <RefreshCw size={15} />,
        onSelect: () => {
          onClose();
          onOpenCollectionModal();
        },
      },
      {
        id: 'act-export-csv',
        title: `Exportar CSV de ${selectedUf}/${selectedAno}`,
        subtitle: 'Baixar planilha oficial das despesas filtradas deste recorte',
        keywords: 'exportar csv baixar planilha download dados',
        icon: <Download size={15} />,
        onSelect: () => {
          onClose();
          onExportCsv();
        },
      },
    ];

    for (const act of actionCandidates) {
      if (!normQuery || normalizeText(`${act.title} ${act.subtitle} ${act.keywords}`).includes(normQuery)) {
        list.push({
          id: act.id,
          group: 'actions',
          title: act.title,
          subtitle: act.subtitle,
          icon: act.icon,
          onSelect: act.onSelect,
        });
      }
    }

    return list;
  }, [
    trimmedQuery,
    normQuery,
    deputados,
    ufSummaryMap,
    selectedUf,
    selectedAno,
    onClose,
    onJumpToExpenses,
    onOpenDeputy,
    onSelectUf,
    onNavigateSection,
    onOpenCollectionModal,
    onExportCsv,
  ]);

  // Clamp activeIndex cleanly during render/change
  const safeActiveIndex = items.length === 0 ? -1 : Math.min(activeIndex, items.length - 1);

  useEffect(() => {
    setActiveIndex(0);
  }, [normQuery]);

  // Keep active row scrolled into view
  useEffect(() => {
    if (!open || safeActiveIndex < 0 || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(
      `[data-cmd-index="${safeActiveIndex}"]`
    );
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [open, safeActiveIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(items.length - 1);
      } else if (e.key === 'Enter' && safeActiveIndex >= 0) {
        e.preventDefault();
        items[safeActiveIndex]?.onSelect();
      }
    },
    [items, safeActiveIndex, onClose]
  );

  // Group items preserving flattened index order
  const groupedSections = useMemo(() => {
    const groups: Array<{ group: CommandGroupId; entries: Array<{ item: CommandItem; flatIndex: number }> }> = [];
    const seen = new Map<CommandGroupId, number>();
    items.forEach((item, flatIndex) => {
      const existing = seen.get(item.group);
      if (existing === undefined) {
        seen.set(item.group, groups.length);
        groups.push({ group: item.group, entries: [{ item, flatIndex }] });
      } else {
        groups[existing].entries.push({ item, flatIndex });
      }
    });
    return groups;
  }, [items]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="cmdk-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Busca rápida e comandos do Radar Legislativo"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={shouldReduce ? { duration: 0.01 } : { duration: 0.16 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="cmdk-panel"
            initial={shouldReduce ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.975 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={shouldReduce ? { duration: 0.01 } : PANEL_SPRING}
            onKeyDown={handleKeyDown}
          >
            <div className="cmdk-input-row">
              <Search size={17} className="cmdk-search-icon" aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                className="cmdk-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Buscar UF (27), deputado em ${selectedUf}/${selectedAno}, seção ou fornecedor…`}
                aria-label="Buscar UF, parlamentar, seção ou fornecedor"
                aria-activedescendant={
                  safeActiveIndex >= 0 ? `cmdk-item-${items[safeActiveIndex]?.id}` : undefined
                }
                role="combobox"
                aria-expanded="true"
                aria-controls="cmdk-results-list"
                aria-autocomplete="list"
              />
              {query ? (
                <button
                  type="button"
                  className="cmdk-clear-btn"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  aria-label="Limpar busca"
                >
                  <X size={14} />
                </button>
              ) : null}
              <button
                type="button"
                className="cmdk-esc-btn"
                onClick={onClose}
                aria-label="Fechar busca rápida"
              >
                <kbd>Esc</kbd>
              </button>
            </div>

            <div className="cmdk-context-strip">
              <span className="mono">
                Recorte ativo: <strong>{selectedUf} · {selectedAno}</strong>
              </span>
              <span className="cmdk-context-counts tabular">
                {formatInt(deputados.length)} deputados carregados · 27 UFs indexadas
              </span>
            </div>

            <div ref={listRef} id="cmdk-results-list" className="cmdk-list" role="listbox">
              {groupedSections.length === 0 ? (
                <div className="cmdk-empty">
                  <p>Nenhum item encontrado para &ldquo;{trimmedQuery}&rdquo;.</p>
                </div>
              ) : (
                groupedSections.map(({ group, entries }) => (
                  <div key={group} className="cmdk-group" role="group" aria-label={GROUP_LABELS[group]}>
                    <div className="cmdk-group-label">{GROUP_LABELS[group]}</div>
                    {entries.map(({ item, flatIndex }) => {
                      const isActive = flatIndex === safeActiveIndex;
                      return (
                        <button
                          key={item.id}
                          id={`cmdk-item-${item.id}`}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          data-cmd-index={flatIndex}
                          className={`cmdk-item ${isActive ? 'cmdk-item--active' : ''}`}
                          onMouseEnter={() => setActiveIndex(flatIndex)}
                          onClick={item.onSelect}
                        >
                          {isActive && !shouldReduce ? (
                            <motion.span
                              layoutId="cmdk-active-highlight"
                              className="cmdk-item-highlight"
                              transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                            />
                          ) : null}

                          <span className="cmdk-item-leading" aria-hidden="true">
                            {item.avatarUrl ? (
                              <img
                                src={item.avatarUrl}
                                alt=""
                                className="cmdk-avatar"
                                loading="lazy"
                              />
                            ) : item.initials ? (
                              <span className="cmdk-avatar-fallback">{item.initials}</span>
                            ) : (
                              item.icon
                            )}
                          </span>

                          <span className="cmdk-item-body">
                            <span className="cmdk-item-title">{item.title}</span>
                            {item.subtitle ? (
                              <span className="cmdk-item-sub">{item.subtitle}</span>
                            ) : null}
                          </span>

                          <span className="cmdk-item-trailing">
                            {item.meta ? (
                              <span className="cmdk-item-meta tabular">{item.meta}</span>
                            ) : null}
                            {item.badge ? (
                              <span className={`cmdk-badge cmdk-badge--${item.badge.tone}`}>
                                {item.badge.label}
                              </span>
                            ) : null}
                            <ArrowRight size={13} className="cmdk-item-arrow" aria-hidden="true" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="cmdk-footer">
              <div className="cmdk-hints">
                <span>
                  <kbd>↑</kbd> <kbd>↓</kbd> navegar
                </span>
                <span>
                  <kbd>↵</kbd> abrir
                </span>
                <span>
                  <kbd>Esc</kbd> fechar
                </span>
              </div>
              <span className="cmdk-footer-note">
                Digite um fornecedor ou CNPJ para filtrar em Despesas
              </span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
});
