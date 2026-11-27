import {
  memo,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  ExternalLink,
  FileText,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { radarApi } from '../services/api';
import type {
  DeputadoCardOut,
  DespesaOut,
  DespesasPageResponse,
  MetaResponse,
} from '../types/api';
import {
  formatBRL,
  formatDateBR,
  formatDocumentTaxId,
  formatInt,
  getMonthLabel,
  shortenCategory,
} from '../utils/format';
import './ExpensesSection.css';

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
  externalSearchQuery?: string;
  externalSearchNonce?: number;
}

type SortOrder = 'data_desc' | 'valor_desc' | 'valor_asc';

interface ActiveFilterChip {
  id: string;
  kind: string;
  label: string;
  onRemove: () => void;
}

const CONTRA_EASE = [0.48, 0.05, 0.35, 0.99] as const;

const CHIP_SPRING = {
  type: 'spring' as const,
  stiffness: 520,
  damping: 24,
  mass: 0.75,
};

const CHIP_LAYOUT_SPRING = {
  type: 'spring' as const,
  stiffness: 450,
  damping: 32,
};

const REDUCED_FADE = { duration: 0.12 };

const DRAWER_TRANSITION = {
  duration: 0.22,
  ease: CONTRA_EASE,
};

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

const SORT_LABELS: Record<SortOrder, string> = {
  data_desc: 'Mais recentes',
  valor_desc: 'Maior valor',
  valor_asc: 'Menor / estornos',
};

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, idx) => {
  const num = idx + 1;
  return {
    value: String(num),
    label: getMonthLabel(num),
  };
});

const MONTH_TOKEN_MAP: Record<string, string> = {
  '1': '1',
  '01': '1',
  jan: '1',
  janeiro: '1',
  '2': '2',
  '02': '2',
  fev: '2',
  fevereiro: '2',
  '3': '3',
  '03': '3',
  mar: '3',
  marco: '3',
  '4': '4',
  '04': '4',
  abr: '4',
  abril: '4',
  '5': '5',
  '05': '5',
  mai: '5',
  maio: '5',
  '6': '6',
  '06': '6',
  jun: '6',
  junho: '6',
  '7': '7',
  '07': '7',
  jul: '7',
  julho: '7',
  '8': '8',
  '08': '8',
  ago: '8',
  agosto: '8',
  '9': '9',
  '09': '9',
  set: '9',
  setembro: '9',
  '10': '10',
  out: '10',
  outubro: '10',
  '11': '11',
  nov: '11',
  novembro: '11',
  '12': '12',
  dez: '12',
  dezembro: '12',
};

const SKELETON_WIDTHS = [
  ['78%', '56%', '72%', '86%', '68%', '70%', '62%'],
  ['66%', '74%', '64%', '74%', '60%', '62%', '54%'],
  ['84%', '62%', '70%', '90%', '72%', '76%', '58%'],
  ['72%', '68%', '66%', '78%', '64%', '66%', '60%'],
  ['80%', '58%', '74%', '82%', '70%', '72%', '56%'],
  ['68%', '70%', '62%', '76%', '62%', '64%', '52%'],
  ['76%', '64%', '68%', '88%', '66%', '68%', '60%'],
  ['70%', '60%', '70%', '80%', '64%', '70%', '56%'],
] as const;

const FORMATTED_TAX_ID_RE = /^[\d.\-/]+$/;

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeApiSearchTerm(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (FORMATTED_TAX_ID_RE.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 6) return digits;
  }
  return trimmed;
}

function buildPaginationItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, totalPages, currentPage]);
  if (currentPage > 1) pages.add(currentPage - 1);
  if (currentPage < totalPages) pages.add(currentPage + 1);
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const items: Array<number | 'ellipsis'> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      items.push('ellipsis');
    }
    items.push(sorted[i]);
  }
  return items;
}

interface FilterChipItemProps {
  chip: ActiveFilterChip;
  reducedMotion: boolean;
}

const FilterChipItem = memo(function FilterChipItem({
  chip,
  reducedMotion,
}: FilterChipItemProps) {
  return (
    <motion.span
      layout={reducedMotion ? false : 'position'}
      className="expenses-chip"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.76, y: -4 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.72 }}
      transition={
        reducedMotion
          ? REDUCED_FADE
          : {
              ...CHIP_SPRING,
              layout: CHIP_LAYOUT_SPRING,
            }
      }
    >
      <span className="expenses-chip-kind">{chip.kind}</span>
      <span className="expenses-chip-text" title={chip.label}>
        {chip.label}
      </span>
      <button
        type="button"
        className="expenses-chip-remove"
        onClick={chip.onRemove}
        aria-label={`Remover filtro ${chip.kind}: ${chip.label}`}
      >
        <X size={11} aria-hidden="true" />
      </button>
    </motion.span>
  );
});

interface ExpenseTableRowProps {
  row: DespesaOut;
  index: number;
  reducedMotion: boolean;
  onOpenDeputy: (id: number) => void;
}

const ExpenseTableRow = memo(function ExpenseTableRow({
  row,
  index,
  reducedMotion,
  onOpenDeputy,
}: ExpenseTableRowProps) {
  const shortCat = shortenCategory(row.tipo_despesa);
  const formattedTaxId = formatDocumentTaxId(row.cnpj_cpf_fornecedor);
  const isCredit = row.valor_liquido < 0;
  const docLabel = row.num_documento ? `Doc. ${row.num_documento}` : 'Abrir PDF';
  const sourceLabel = row.fonte_url.endsWith('.csv.zip') ? 'CEAP' : 'API';

  return (
    <motion.tr
      className="expenses-row"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={
        reducedMotion
          ? REDUCED_FADE
          : {
              duration: 0.2,
              delay: Math.min(index * 0.015, 0.22),
              ease: CONTRA_EASE,
            }
      }
    >
      <td className="exp-cell--deputy">
        <button
          type="button"
          className="exp-deputy-link"
          onClick={() => onOpenDeputy(row.deputado_id)}
          title={`Abrir perfil de ${row.deputado_nome}`}
        >
          {row.deputado_nome}
        </button>
        <div className="exp-submeta">
          {row.deputado_partido ?? 'S/P'} · {row.uf}
        </div>
      </td>

      <td className="exp-cell--category">
        <span className="exp-category-pill" title={row.tipo_despesa}>
          {shortCat}
        </span>
      </td>

      <td className="exp-cell--date tabular">
        <div className="exp-date-main">{formatDateBR(row.data_documento)}</div>
        <div className="exp-submeta">
          Comp. {String(row.mes).padStart(2, '0')}/{row.ano}
        </div>
      </td>

      <td className="exp-cell--supplier">
        <div className="exp-supplier-name" title={row.nome_fornecedor}>
          {row.nome_fornecedor}
        </div>
        <div className="exp-supplier-tax mono" title={formattedTaxId}>
          {formattedTaxId}
        </div>
      </td>

      <td className="exp-cell--amount num-col">
        <strong className={isCredit ? 'exp-amount-main exp-amount-main--credit' : 'exp-amount-main'}>
          {formatBRL(row.valor_liquido)}
        </strong>
        {isCredit ? <span className="exp-credit-tag">Crédito/Estorno</span> : null}
        {row.valor_glosa > 0 ? (
          <div className="exp-glosa-note">Glosa: {formatBRL(row.valor_glosa)}</div>
        ) : null}
      </td>

      <td className="exp-cell--doc">
        {row.url_documento ? (
          <a
            href={row.url_documento}
            target="_blank"
            rel="noreferrer"
            className="exp-doc-link"
            title={docLabel}
          >
            <FileText size={13} aria-hidden="true" />
            <span>{docLabel}</span>
          </a>
        ) : (
          <span
            className="exp-doc-unavailable"
            title={row.num_documento ? `Documento nº ${row.num_documento}` : 'Documento indisponível'}
          >
            {row.num_documento ? `Nº ${row.num_documento}` : 'Indisponível'}
          </span>
        )}
      </td>

      <td className="exp-cell--source">
        <a
          href={row.fonte_url}
          target="_blank"
          rel="noreferrer"
          className="exp-source-link"
          title={
            row.fonte_url.endsWith('.csv.zip')
              ? 'Consultar arquivo anual oficial da CEAP'
              : 'Consultar fonte oficial na API da Câmara'
          }
        >
          <span>{sourceLabel}</span>
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </td>
    </motion.tr>
  );
});

const SkeletonRow = memo(function SkeletonRow({ idx }: { idx: number }) {
  const w = SKELETON_WIDTHS[idx % SKELETON_WIDTHS.length];
  return (
    <tr className="expenses-skeleton-row" aria-hidden="true">
      <td className="exp-cell--deputy">
        <div className="exp-skel-stack">
          <div className="exp-skel-bar" style={{ width: w[0] }} />
          <div className="exp-skel-bar exp-skel-bar--sub" style={{ width: '48%' }} />
        </div>
      </td>
      <td className="exp-cell--category">
        <div className="exp-skel-bar exp-skel-bar--pill" style={{ width: w[1] }} />
      </td>
      <td className="exp-cell--date">
        <div className="exp-skel-stack">
          <div className="exp-skel-bar" style={{ width: w[2] }} />
          <div className="exp-skel-bar exp-skel-bar--sub" style={{ width: '58%' }} />
        </div>
      </td>
      <td className="exp-cell--supplier">
        <div className="exp-skel-stack">
          <div className="exp-skel-bar" style={{ width: w[3] }} />
          <div className="exp-skel-bar exp-skel-bar--sub" style={{ width: '52%' }} />
        </div>
      </td>
      <td className="exp-cell--amount num-col">
        <div className="exp-skel-stack exp-skel-stack--end">
          <div className="exp-skel-bar" style={{ width: w[4] }} />
        </div>
      </td>
      <td className="exp-cell--doc">
        <div className="exp-skel-bar" style={{ width: w[5] }} />
      </td>
      <td className="exp-cell--source">
        <div className="exp-skel-bar" style={{ width: w[6] }} />
      </td>
    </tr>
  );
});

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
  externalSearchQuery,
  externalSearchNonce,
}: ExpensesSectionProps) {
  const prefersReducedMotion = Boolean(useReducedMotion());

  const [deputadoId, setDeputadoId] = useState<string>('');
  const [categoria, setCategoria] = useState<string>('');
  const [mes, setMes] = useState<string>('');
  const [buscaInput, setBuscaInput] = useState<string>('');
  const [buscaQuery, setBuscaQuery] = useState<string>('');
  const [ordenarPor, setOrdenarPor] = useState<SortOrder>('data_desc');
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState<number>(1);
  const [jumpInput, setJumpInput] = useState<string>('');

  const [data, setData] = useState<DespesasPageResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [showRefetchSkeleton, setShowRefetchSkeleton] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isStuck, setIsStuck] = useState<boolean>(false);
  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 960 : false
  );
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState<boolean>(false);
  const [preservedMinHeight, setPreservedMinHeight] = useState<number>(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const tableFrameRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<Map<string, DespesasPageResponse>>(new Map());
  const lastExternalNonceRef = useRef<number>(0);

  const deferredBuscaPreview = useDeferredValue(buscaInput);

  // Reset slice-scoped filters synchronously during render to avoid stale-filter double fetches
  const sliceKey = `${selectedUf}:${selectedAno}`;
  const [prevSliceKey, setPrevSliceKey] = useState<string>(sliceKey);
  if (prevSliceKey !== sliceKey) {
    setPrevSliceKey(sliceKey);
    setDeputadoId('');
    setCategoria('');
    setMes('');
    setPage(1);
    setJumpInput('');
  }

  // Clear local response cache when refreshToken increments (e.g. after new collection)
  const [prevRefreshToken, setPrevRefreshToken] = useState<number>(refreshToken);
  if (prevRefreshToken !== refreshToken) {
    setPrevRefreshToken(refreshToken);
    cacheRef.current.clear();
  }

  // Sync optional external search injection from CommandPalette
  useEffect(() => {
    if (externalSearchNonce && externalSearchNonce !== lastExternalNonceRef.current) {
      lastExternalNonceRef.current = externalSearchNonce;
      const incoming = (externalSearchQuery ?? '').trim();
      setBuscaInput(incoming);
      startTransition(() => {
        setBuscaQuery(incoming);
        setPage(1);
      });
    }
  }, [externalSearchNonce, externalSearchQuery]);

  // Responsive viewport watcher for collapsible "Mais filtros" drawer
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 960px)');
    const sync = () => {
      setIsCompactViewport(mq.matches);
      if (!mq.matches) {
        setFiltersDrawerOpen(false);
      }
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Sticky toolbar shadow detection via sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsStuck(!entry.isIntersecting);
        }
      },
      { rootMargin: '-50px 0px 0px 0px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Global "/" shortcut to focus the spreadsheet search prompt when not typing in an input
  useEffect(() => {
    const onGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const input = searchInputRef.current;
      if (!input) return;
      // Only hijack "/" when the Expenses section is within or near the viewport
      const rect = input.getBoundingClientRect();
      if (rect.top < window.innerHeight * 1.15 && rect.bottom > -window.innerHeight * 0.4) {
        event.preventDefault();
        input.focus();
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  // Debounce live search input -> buscaQuery
  useEffect(() => {
    const trimmed = buscaInput.trim();
    if (trimmed === buscaQuery) return;
    const timer = window.setTimeout(() => {
      startTransition(() => {
        setBuscaQuery(trimmed);
        setPage(1);
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [buscaInput, buscaQuery]);

  const apiBusca = useMemo(() => normalizeApiSearchTerm(buscaQuery), [buscaQuery]);

  // Fetch paginated expenses with in-memory cache + graceful skeleton delay
  useEffect(() => {
    const queryKey = JSON.stringify({
      uf: selectedUf,
      ano: selectedAno,
      deputado_id: deputadoId ? Number(deputadoId) : null,
      categoria: categoria || undefined,
      mes: mes ? Number(mes) : null,
      busca: apiBusca || undefined,
      ordenar_por: ordenarPor,
      page,
      page_size: pageSize,
      refreshToken,
    });

    const cached = cacheRef.current.get(queryKey);
    if (cached) {
      setData(cached);
      setLoading(false);
      setShowRefetchSkeleton(false);
      setErrorMsg(null);
      return;
    }

    let active = true;
    const currentFrameHeight = tableFrameRef.current?.offsetHeight ?? 0;
    if (currentFrameHeight > 180) {
      setPreservedMinHeight(currentFrameHeight);
    }

    setLoading(true);
    setErrorMsg(null);

    const skeletonTimer = window.setTimeout(() => {
      if (active) {
        setShowRefetchSkeleton(true);
      }
    }, 180);

    radarApi
      .getDespesas({
        uf: selectedUf,
        ano: selectedAno,
        deputado_id: deputadoId ? Number(deputadoId) : null,
        categoria: categoria || undefined,
        mes: mes ? Number(mes) : null,
        busca: apiBusca || undefined,
        ordenar_por: ordenarPor,
        page,
        page_size: pageSize,
      })
      .then((res) => {
        if (!active) return;
        if (cacheRef.current.size > 40) {
          const oldestKey = cacheRef.current.keys().next().value;
          if (oldestKey) cacheRef.current.delete(oldestKey);
        }
        cacheRef.current.set(queryKey, res);
        setData(res);
      })
      .catch((err) => {
        if (active) {
          setErrorMsg(err instanceof Error ? err.message : 'Erro ao consultar despesas.');
        }
      })
      .finally(() => {
        window.clearTimeout(skeletonTimer);
        if (active) {
          setLoading(false);
          setShowRefetchSkeleton(false);
          setPreservedMinHeight(0);
        }
      });

    return () => {
      active = false;
      window.clearTimeout(skeletonTimer);
    };
  }, [
    selectedUf,
    selectedAno,
    deputadoId,
    categoria,
    mes,
    apiBusca,
    ordenarPor,
    page,
    pageSize,
    refreshToken,
  ]);

  // Index deputados in a Map for O(1) chip lookups
  const deputadosById = useMemo(() => {
    const map = new Map<number, DeputadoCardOut>();
    for (const d of deputados) {
      map.set(d.id, d);
    }
    return map;
  }, [deputados]);

  const csvUrl = useMemo(
    () =>
      radarApi.getDespesasCsvUrl({
        uf: selectedUf,
        ano: selectedAno,
        deputado_id: deputadoId ? Number(deputadoId) : null,
        categoria: categoria || undefined,
        mes: mes ? Number(mes) : null,
        busca: apiBusca || undefined,
      }),
    [selectedUf, selectedAno, deputadoId, categoria, mes, apiBusca]
  );

  const resetFilters = useCallback(() => {
    setBuscaInput('');
    setJumpInput('');
    startTransition(() => {
      setDeputadoId('');
      setCategoria('');
      setMes('');
      setBuscaQuery('');
      setOrdenarPor('data_desc');
      setPageSize(20);
      setPage(1);
    });
  }, []);

  // Parse smart spreadsheet prompt commands on Enter (e.g. "mes:out", "cat:passagens", "dep:silva", "estornos")
  const commitSmartPrompt = useCallback(
    (rawInput: string) => {
      const trimmed = rawInput.trim();
      if (!trimmed) {
        startTransition(() => {
          setBuscaQuery('');
          setPage(1);
        });
        return;
      }

      const tokens = trimmed.split(/\s+/);
      const remaining: string[] = [];
      let nextMes: string | null = null;
      let nextCat: string | null = null;
      let nextDep: string | null = null;
      let nextSort: SortOrder | null = null;
      let matchedCommand = false;

      for (const token of tokens) {
        const norm = normalizeText(token);
        if (norm.startsWith('mes:')) {
          const mVal = MONTH_TOKEN_MAP[norm.slice(4)];
          if (mVal) {
            nextMes = mVal;
            matchedCommand = true;
            continue;
          }
        }
        if (norm.startsWith('cat:')) {
          const needle = norm.slice(4);
          if (needle) {
            const match = categoriasDisponiveis.find(
              (c) =>
                normalizeText(c).includes(needle) ||
                normalizeText(shortenCategory(c)).includes(needle)
            );
            if (match) {
              nextCat = match;
              matchedCommand = true;
              continue;
            }
          }
        }
        if (norm.startsWith('dep:')) {
          const needle = norm.slice(4);
          if (needle) {
            const match = deputados.find((d) => normalizeText(d.nome_parlamentar).includes(needle));
            if (match) {
              nextDep = String(match.id);
              matchedCommand = true;
              continue;
            }
          }
        }
        if (norm === 'estornos' || norm === 'ordem:estornos' || norm === 'ordem:menor') {
          nextSort = 'valor_asc';
          matchedCommand = true;
          continue;
        }
        if (norm === 'ordem:maior' || norm === 'maiores') {
          nextSort = 'valor_desc';
          matchedCommand = true;
          continue;
        }
        remaining.push(token);
      }

      const leftover = remaining.join(' ').trim();
      if (matchedCommand) {
        setBuscaInput(leftover);
      }
      startTransition(() => {
        if (nextMes !== null) setMes(nextMes);
        if (nextCat !== null) setCategoria(nextCat);
        if (nextDep !== null) setDeputadoId(nextDep);
        if (nextSort !== null) setOrdenarPor(nextSort);
        setBuscaQuery(leftover);
        setPage(1);
      });
    },
    [categoriasDisponiveis, deputados]
  );

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitSmartPrompt(buscaInput);
      } else if (event.key === 'Escape' && buscaInput) {
        event.preventDefault();
        setBuscaInput('');
        startTransition(() => {
          setBuscaQuery('');
          setPage(1);
        });
      }
    },
    [buscaInput, commitSmartPrompt]
  );

  const goToPage = useCallback(
    (targetPage: number) => {
      startTransition(() => {
        setPage(targetPage);
      });
      const sentinel = sentinelRef.current;
      if (sentinel) {
        const rect = sentinel.getBoundingClientRect();
        if (rect.top < 49) {
          sentinel.scrollIntoView({
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
            block: 'start',
          });
        }
      }
    },
    [prefersReducedMotion]
  );

  const handleJumpSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (!data) return;
      const parsed = Number.parseInt(jumpInput, 10);
      if (!Number.isFinite(parsed)) return;
      const clamped = Math.min(Math.max(1, parsed), data.total_pages);
      setJumpInput('');
      goToPage(clamped);
    },
    [data, jumpInput, goToPage]
  );

  // Derive active removable filter chips during render
  const activeChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];

    if (deputadoId) {
      const dep = deputadosById.get(Number(deputadoId));
      chips.push({
        id: `dep-${deputadoId}`,
        kind: 'Dep.',
        label: dep ? dep.nome_parlamentar : `#${deputadoId}`,
        onRemove: () => {
          startTransition(() => {
            setDeputadoId('');
            setPage(1);
          });
        },
      });
    }

    if (categoria) {
      chips.push({
        id: `cat-${categoria}`,
        kind: 'Categoria',
        label: shortenCategory(categoria),
        onRemove: () => {
          startTransition(() => {
            setCategoria('');
            setPage(1);
          });
        },
      });
    }

    if (mes) {
      chips.push({
        id: `mes-${mes}`,
        kind: 'Mês',
        label: getMonthLabel(Number(mes)),
        onRemove: () => {
          startTransition(() => {
            setMes('');
            setPage(1);
          });
        },
      });
    }

    if (buscaQuery) {
      chips.push({
        id: `busca-${buscaQuery}`,
        kind: 'Busca',
        label: `"${buscaQuery}"`,
        onRemove: () => {
          setBuscaInput('');
          startTransition(() => {
            setBuscaQuery('');
            setPage(1);
          });
        },
      });
    }

    if (ordenarPor !== 'data_desc') {
      chips.push({
        id: `ordem-${ordenarPor}`,
        kind: 'Ordem',
        label: SORT_LABELS[ordenarPor],
        onRemove: () => {
          startTransition(() => {
            setOrdenarPor('data_desc');
            setPage(1);
          });
        },
      });
    }

    if (pageSize !== 20) {
      chips.push({
        id: `size-${pageSize}`,
        kind: 'Exibição',
        label: `${pageSize}/página`,
        onRemove: () => {
          startTransition(() => {
            setPageSize(20);
            setPage(1);
          });
        },
      });
    }

    return chips;
  }, [deputadoId, deputadosById, categoria, mes, buscaQuery, ordenarPor, pageSize]);

  const secondaryFilterCount =
    (deputadoId ? 1 : 0) +
    (categoria ? 1 : 0) +
    (mes ? 1 : 0) +
    (ordenarPor !== 'data_desc' ? 1 : 0) +
    (pageSize !== 20 ? 1 : 0);

  const topQuickCategories = useMemo(
    () => categoriasDisponiveis.slice(0, 3),
    [categoriasDisponiveis]
  );

  const showSkeletonRows = (loading && !data) || (loading && showRefetchSkeleton);
  const skeletonCount = data ? Math.min(Math.max(data.items.length, 6), 10) : 8;
  const isRefetchDimmed = loading && Boolean(data) && !showRefetchSkeleton;
  const filtersVisible = !isCompactViewport || filtersDrawerOpen;

  const pageRangeStart = data && data.total > 0 ? (data.page - 1) * data.page_size + 1 : 0;
  const pageRangeEnd =
    data && data.total > 0 ? Math.min(data.page * data.page_size, data.total) : 0;
  const paginationItems = useMemo(
    () => (data ? buildPaginationItems(data.page, data.total_pages) : []),
    [data]
  );

  const pageKey = data
    ? `${data.page}-${data.page_size}-${data.total}-${data.items[0]?.id ?? 'empty'}`
    : 'initial';

  return (
    <section id="despesas" className="page-section">
      <div className="container">
        <div className="section-header expenses-section-header">
          <div>
            <h2 className="section-title">Despesas parlamentares registradas</h2>
            <p className="section-subtitle">
              Consulta granular com filtros combinados por estado, ano, deputado, categoria, mês e
              fornecedor, incluindo soma filtrada e acesso direto à nota fiscal oficial.
            </p>
          </div>

          <div className="expenses-header-actions">
            <a href={csvUrl} className="btn btn-sm">
              <Download size={14} aria-hidden="true" />
              Exportar recorte em CSV
            </a>
          </div>
        </div>

        <div ref={sentinelRef} className="expenses-sticky-sentinel" aria-hidden="true" />

        <div
          className={
            isStuck ? 'expenses-sticky-bar expenses-sticky-bar--stuck' : 'expenses-sticky-bar'
          }
          role="search"
          aria-label="Barra de busca e filtros de despesas"
        >
          {/* Row 1: Spreadsheet-style Smart Search Prompt */}
          <div className="expenses-prompt-row">
            <div className="expenses-prompt-box">
              <span className="expenses-prompt-icon" aria-hidden="true">
                <Search size={15} />
              </span>
              <input
                ref={searchInputRef}
                id="despesas-search-input"
                type="search"
                className="expenses-prompt-input"
                placeholder="Buscar fornecedor, CNPJ, parlamentar ou atalho (mes:out, cat:passagens, estornos)…"
                aria-label="Buscar por fornecedor, CNPJ, parlamentar ou comando de filtro"
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              {buscaInput ? (
                <button
                  type="button"
                  className="expenses-prompt-clear"
                  aria-label="Limpar busca textual"
                  onClick={() => {
                    setBuscaInput('');
                    startTransition(() => {
                      setBuscaQuery('');
                      setPage(1);
                    });
                    searchInputRef.current?.focus();
                  }}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              ) : (
                <kbd className="expenses-kbd-hint" title="Pressione / para focar a busca">
                  /
                </kbd>
              )}
            </div>

            <div
              className={
                loading
                  ? 'expenses-summary-badge expenses-summary-badge--loading'
                  : 'expenses-summary-badge'
              }
              aria-live="polite"
            >
              <span className="expenses-summary-count tabular">
                {data
                  ? `${formatInt(data.total)} lanç.`
                  : loading
                    ? 'Consultando…'
                    : '—'}
              </span>
              <span className="expenses-summary-sep" aria-hidden="true">
                ·
              </span>
              <span className="expenses-summary-sum tabular">
                {data ? formatBRL(data.soma_filtrada) : '—'}
              </span>
            </div>

            <button
              type="button"
              className="expenses-more-toggle"
              aria-expanded={filtersDrawerOpen}
              aria-controls="expenses-secondary-filters"
              onClick={() => setFiltersDrawerOpen((open) => !open)}
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              <span>Mais filtros</span>
              {secondaryFilterCount > 0 ? (
                <span className="expenses-more-badge">{secondaryFilterCount}</span>
              ) : null}
              <ChevronDown
                size={14}
                aria-hidden="true"
                style={{
                  transform: filtersDrawerOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 160ms ease',
                }}
              />
            </button>
          </div>

          {/* Row 2: Compact Horizontal 7-Filter Strip (Collapsible Drawer < 960px) */}
          <AnimatePresence initial={false}>
            {filtersVisible ? (
              <motion.div
                key="expenses-filters-drawer"
                id="expenses-secondary-filters"
                className="expenses-filters-collapse"
                initial={
                  isCompactViewport
                    ? prefersReducedMotion
                      ? { opacity: 0 }
                      : { height: 0, opacity: 0 }
                    : false
                }
                animate={
                  prefersReducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }
                }
                exit={
                  prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }
                }
                transition={prefersReducedMotion ? REDUCED_FADE : DRAWER_TRANSITION}
              >
                <div className="expenses-filters-strip">
                  <div className="expenses-filter-cell">
                    <span className="expenses-filter-label">UF</span>
                    <select
                      className="expenses-compact-select"
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
                  </div>

                  <div className="expenses-filter-cell">
                    <span className="expenses-filter-label">Ano</span>
                    <select
                      className="expenses-compact-select tabular"
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
                  </div>

                  <div
                    className={
                      deputadoId
                        ? 'expenses-filter-cell expenses-filter-cell--active'
                        : 'expenses-filter-cell'
                    }
                  >
                    <span className="expenses-filter-label">Dep.</span>
                    <select
                      className="expenses-compact-select"
                      aria-label="Filtrar despesas por deputado"
                      value={deputadoId}
                      onChange={(e) => {
                        const val = e.target.value;
                        startTransition(() => {
                          setDeputadoId(val);
                          setPage(1);
                        });
                      }}
                    >
                      <option value="">Todos ({deputados.length})</option>
                      {deputados.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nome_parlamentar} ({d.partido ?? 'S/P'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div
                    className={
                      categoria
                        ? 'expenses-filter-cell expenses-filter-cell--active'
                        : 'expenses-filter-cell'
                    }
                  >
                    <span className="expenses-filter-label">Cat.</span>
                    <select
                      className="expenses-compact-select"
                      aria-label="Filtrar despesas por categoria"
                      value={categoria}
                      onChange={(e) => {
                        const val = e.target.value;
                        startTransition(() => {
                          setCategoria(val);
                          setPage(1);
                        });
                      }}
                    >
                      <option value="">Todas categorias</option>
                      {categoriasDisponiveis.map((cat) => (
                        <option key={cat} value={cat}>
                          {shortenCategory(cat)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div
                    className={
                      mes
                        ? 'expenses-filter-cell expenses-filter-cell--active'
                        : 'expenses-filter-cell'
                    }
                  >
                    <span className="expenses-filter-label">Mês</span>
                    <select
                      className="expenses-compact-select"
                      aria-label="Filtrar despesas por mês"
                      value={mes}
                      onChange={(e) => {
                        const val = e.target.value;
                        startTransition(() => {
                          setMes(val);
                          setPage(1);
                        });
                      }}
                    >
                      <option value="">Todos meses</option>
                      {MONTH_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div
                    className={
                      ordenarPor !== 'data_desc'
                        ? 'expenses-filter-cell expenses-filter-cell--active'
                        : 'expenses-filter-cell'
                    }
                  >
                    <span className="expenses-filter-label">Ordem</span>
                    <select
                      className="expenses-compact-select"
                      aria-label="Ordenar despesas"
                      value={ordenarPor}
                      onChange={(e) => {
                        const val = e.target.value as SortOrder;
                        startTransition(() => {
                          setOrdenarPor(val);
                          setPage(1);
                        });
                      }}
                    >
                      <option value="data_desc">Mais recentes</option>
                      <option value="valor_desc">Maior valor líquido</option>
                      <option value="valor_asc">Menor / estornos</option>
                    </select>
                  </div>

                  <div
                    className={
                      pageSize !== 20
                        ? 'expenses-filter-cell expenses-filter-cell--active'
                        : 'expenses-filter-cell'
                    }
                  >
                    <span className="expenses-filter-label">Linhas</span>
                    <select
                      className="expenses-compact-select tabular"
                      aria-label="Quantidade de lançamentos por página"
                      value={pageSize}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        startTransition(() => {
                          setPageSize(val);
                          setPage(1);
                        });
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size} / pág.
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Row 3: Quick-Filter Editorial Prompts */}
          <div className="expenses-meta-strip">
            <div className="expenses-quick-prompts" role="group" aria-label="Atalhos rápidos de filtro">
              <span className="expenses-quick-label">
                <Sparkles size={11} aria-hidden="true" />
                Atalhos
              </span>

              {topQuickCategories.map((cat) => {
                const isSelected = categoria === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    className={
                      isSelected
                        ? 'expenses-prompt-pill expenses-prompt-pill--active'
                        : 'expenses-prompt-pill'
                    }
                    aria-pressed={isSelected}
                    title={`Filtrar por ${shortenCategory(cat)}`}
                    onClick={() => {
                      startTransition(() => {
                        setCategoria((prev) => (prev === cat ? '' : cat));
                        setPage(1);
                      });
                    }}
                  >
                    <span>{shortenCategory(cat)}</span>
                  </button>
                );
              })}

              <button
                type="button"
                className={
                  ordenarPor === 'valor_desc'
                    ? 'expenses-prompt-pill expenses-prompt-pill--active'
                    : 'expenses-prompt-pill'
                }
                aria-pressed={ordenarPor === 'valor_desc'}
                onClick={() => {
                  startTransition(() => {
                    setOrdenarPor((prev) => (prev === 'valor_desc' ? 'data_desc' : 'valor_desc'));
                    setPage(1);
                  });
                }}
              >
                <span>Maior valor</span>
              </button>

              <button
                type="button"
                className={
                  ordenarPor === 'valor_asc'
                    ? 'expenses-prompt-pill expenses-prompt-pill--active'
                    : 'expenses-prompt-pill'
                }
                aria-pressed={ordenarPor === 'valor_asc'}
                onClick={() => {
                  startTransition(() => {
                    setOrdenarPor((prev) => (prev === 'valor_asc' ? 'data_desc' : 'valor_asc'));
                    setPage(1);
                  });
                }}
              >
                <span>Estornos</span>
              </button>
            </div>

            <span className="expenses-syntax-hint">
              {deferredBuscaPreview.trim()
                ? 'Enter aplica atalhos (mes:, cat:, dep:)'
                : 'Dica: pressione / para buscar · mes:out · cat:passagens'}
            </span>
          </div>

          {/* Elastic Tag Snap Active Removable Chips */}
          <AnimatePresence initial={false}>
            {activeChips.length > 0 ? (
              <motion.div
                key="active-chips-row"
                className="expenses-active-chips-bar"
                role="region"
                aria-label="Filtros ativos"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={REDUCED_FADE}
              >
                <span className="expenses-active-chips-label">Ativos</span>
                <AnimatePresence mode="popLayout">
                  {activeChips.map((chip) => (
                    <FilterChipItem
                      key={chip.id}
                      chip={chip}
                      reducedMotion={prefersReducedMotion}
                    />
                  ))}
                </AnimatePresence>

                <motion.button
                  layout={prefersReducedMotion ? false : 'position'}
                  type="button"
                  className="expenses-clear-all-btn"
                  onClick={resetFilters}
                  transition={prefersReducedMotion ? REDUCED_FADE : CHIP_LAYOUT_SPRING}
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  <span>Limpar filtros</span>
                </motion.button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Ledger Subheader Meta */}
        <div className="expenses-ledger-caption">
          <span className="tabular">
            {data
              ? `${formatInt(data.total)} lançamentos em ${selectedUf}/${selectedAno} · Soma filtrada: `
              : 'Consultando lançamentos oficiais…'}
            {data ? (
              <strong style={{ color: 'var(--ink-primary)' }}>
                {formatBRL(data.soma_filtrada)}
              </strong>
            ) : null}
          </span>
          <span className="expenses-ledger-source">
            Valores líquidos em R$ (BRL) · Fonte: Câmara dos Deputados
          </span>
        </div>

        {errorMsg ? (
          <div className="banner banner--error" role="alert" style={{ marginBottom: 16 }}>
            <span>{errorMsg}</span>
          </div>
        ) : null}

        {/* Responsive Broadsheet Ledger Table */}
        <div
          ref={tableFrameRef}
          className="expenses-table-frame"
          style={
            preservedMinHeight > 0 ? { minHeight: preservedMinHeight } : undefined
          }
        >
          {loading ? (
            <div className="expenses-progress-track" aria-hidden="true">
              <div className="expenses-progress-bar" />
            </div>
          ) : null}

          <div className="table-scroll expenses-table-scroll">
            <table className="data-table expenses-table" aria-busy={loading}>
              <colgroup>
                <col className="exp-col-deputy" />
                <col className="exp-col-category" />
                <col className="exp-col-date" />
                <col className="exp-col-supplier" />
                <col className="exp-col-amount" />
                <col className="exp-col-doc" />
                <col className="exp-col-source" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Parlamentar</th>
                  <th scope="col">Categoria</th>
                  <th scope="col">Data</th>
                  <th scope="col">Fornecedor</th>
                  <th scope="col" className="num-col">
                    Valor líquido
                  </th>
                  <th scope="col">Documento</th>
                  <th scope="col">Fonte</th>
                </tr>
              </thead>
              <tbody
                key={showSkeletonRows ? 'skeleton' : pageKey}
                className={isRefetchDimmed ? 'expenses-tbody--refetching' : undefined}
              >
                {showSkeletonRows ? (
                  Array.from({ length: skeletonCount }, (_, idx) => (
                    <SkeletonRow key={idx} idx={idx} />
                  ))
                ) : data && data.items.length > 0 ? (
                  data.items.map((row, idx) => (
                    <ExpenseTableRow
                      key={row.id}
                      row={row}
                      index={idx}
                      reducedMotion={prefersReducedMotion}
                      onOpenDeputy={onOpenDeputy}
                    />
                  ))
                ) : (
                  <tr className="expenses-empty-row">
                    <td colSpan={7} className="expenses-empty-cell">
                      <div className="expenses-empty-inner">
                        <span>
                          {data && !data.slice_has_data
                            ? `Nenhuma despesa carregada para ${selectedUf}/${selectedAno}.`
                            : 'Nenhum lançamento encontrado para os filtros aplicados.'}
                        </span>
                        {activeChips.length > 0 ? (
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={resetFilters}
                          >
                            <RotateCcw size={13} aria-hidden="true" />
                            Limpar filtros ativos
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Multi-page Broadsheet Pagination */}
        {data && data.total > 0 ? (
          <nav className="expenses-pagination" aria-label="Paginação de despesas">
            <span className="tabular">
              Página <strong>{formatInt(data.page)}</strong> de{' '}
              <strong>{formatInt(data.total_pages)}</strong> · exibindo{' '}
              {formatInt(pageRangeStart)}–{formatInt(pageRangeEnd)} de {formatInt(data.total)}{' '}
              lançamentos
            </span>

            <div className="expenses-pagination-controls">
              <button
                type="button"
                className="exp-page-btn"
                disabled={data.page <= 1 || loading}
                aria-label="Primeira página"
                title="Primeira página"
                onClick={() => goToPage(1)}
              >
                <ChevronsLeft size={14} aria-hidden="true" />
              </button>

              <button
                type="button"
                className="exp-page-btn"
                disabled={data.page <= 1 || loading}
                aria-label="Página anterior"
                onClick={() => goToPage(Math.max(1, data.page - 1))}
              >
                <ChevronLeft size={14} aria-hidden="true" />
                <span>Anterior</span>
              </button>

              {paginationItems.map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`el-${idx}`} className="exp-page-ellipsis" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={
                      item === data.page
                        ? 'exp-page-btn exp-page-btn--active'
                        : 'exp-page-btn'
                    }
                    aria-current={item === data.page ? 'page' : undefined}
                    disabled={loading}
                    onClick={() => goToPage(item)}
                  >
                    {item}
                  </button>
                )
              )}

              <button
                type="button"
                className="exp-page-btn"
                disabled={data.page >= data.total_pages || loading}
                aria-label="Próxima página"
                onClick={() => goToPage(Math.min(data.total_pages, data.page + 1))}
              >
                <span>Próxima</span>
                <ChevronRight size={14} aria-hidden="true" />
              </button>

              <button
                type="button"
                className="exp-page-btn"
                disabled={data.page >= data.total_pages || loading}
                aria-label="Última página"
                title="Última página"
                onClick={() => goToPage(data.total_pages)}
              >
                <ChevronsRight size={14} aria-hidden="true" />
              </button>

              {data.total_pages > 7 ? (
                <form className="exp-page-jump" onSubmit={handleJumpSubmit}>
                  <label htmlFor="expenses-page-jump-input">Ir p/</label>
                  <input
                    id="expenses-page-jump-input"
                    type="number"
                    min={1}
                    max={data.total_pages}
                    inputMode="numeric"
                    className="exp-page-jump-input"
                    placeholder={String(data.page)}
                    aria-label={`Ir para página entre 1 e ${data.total_pages}`}
                    value={jumpInput}
                    onChange={(e) => setJumpInput(e.target.value)}
                  />
                </form>
              ) : null}
            </div>
          </nav>
        ) : null}
      </div>
    </section>
  );
}
