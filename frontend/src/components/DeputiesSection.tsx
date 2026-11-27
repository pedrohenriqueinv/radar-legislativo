import {
  memo,
  startTransition,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  LayoutGrid,
  Search,
  Table2,
  UserRound,
} from 'lucide-react';
import type { DeputadoCardOut, OverviewResponse } from '../types/api';
import { BRAZIL_TILE_GRID, formatBRL, formatBRLCompact, formatInt, formatPct } from '../utils/format';
import {
  CEAP_WARN_THRESHOLD_PCT,
  CeapUsageMeter,
  getEstimatedAnnualCeapCeiling,
} from './CeapUsageMeter';
import './DeputiesSection.css';

type ViewMode = 'cards' | 'table';
type SortMode = 'total_desc' | 'nome_asc' | 'qtd_desc';

const PILL_SPRING = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 34,
  mass: 0.85,
};

const AVATAR_SPRING = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 24,
  mass: 0.8,
};

const BAR_SPRING = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 30,
  mass: 0.9,
};

const CARD_HOVER_TRANSITION = {
  duration: 0.18,
  ease: [0.48, 0.05, 0.35, 0.99] as [number, number, number, number],
};

const INSTANT_TRANSITION = { duration: 0 };

const UF_NAME_MAP = new Map<string, string>(BRAZIL_TILE_GRID.map((t) => [t.uf, t.nome]));

interface DeputiesSectionProps {
  deputados: DeputadoCardOut[];
  loading: boolean;
  selectedUf: string;
  selectedAno: number;
  hasData: boolean;
  onOpenDeputy: (id: number) => void;
  overview?: OverviewResponse | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

interface BentoSummaryMetrics {
  topDeputies: DeputadoCardOut[];
  topCount: number;
  topTotal: number;
  topSharePct: number;
  sliceTotal: number;
  sliceAverage: number;
  sliceMedian: number;
  activeCount: number;
  partyCount: number;
  warnCount: number;
  maxLiquido: number;
}

interface DeputiesBentoStripProps {
  metrics: BentoSummaryMetrics;
  totalDeputies: number;
  selectedUf: string;
  selectedAno: number;
  ufLabel: string;
  brokenImages: Record<number, boolean>;
  onImageError: (id: number) => void;
  onOpenDeputy: (id: number) => void;
}

const DeputiesBentoStrip = memo(function DeputiesBentoStrip({
  metrics,
  totalDeputies,
  selectedUf,
  selectedAno,
  ufLabel,
  brokenImages,
  onImageError,
  onOpenDeputy,
}: DeputiesBentoStripProps) {
  const shouldReduce = useReducedMotion();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const activeDeputy =
    hoveredIdx !== null
      ? (metrics.topDeputies[hoveredIdx] ?? metrics.topDeputies[0] ?? null)
      : (metrics.topDeputies[0] ?? null);
  const activeRank = hoveredIdx !== null ? hoveredIdx + 1 : 1;
  const overflowCount = Math.max(0, totalDeputies - metrics.topDeputies.length);
  const isConcentrationHigh = totalDeputies >= 8 && metrics.topSharePct >= 75;

  return (
    <div className="deputies-bento" aria-label={`Resumo da bancada de ${ufLabel} em ${selectedAno}`}>
      {/* Cell 1: Overlapping Avatar Cluster of Top Volume Deputies */}
      <div
        className="deputies-bento__cell deputies-bento__cell--cluster"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        <div className="deputies-bento__kicker">
          <span>Maiores volumes ({selectedUf}/{selectedAno})</span>
          <span className="mono tabular">Clique no retrato</span>
        </div>

        <div className="avatar-cluster-wrap">
          <div className="avatar-cluster" role="list" aria-label="Deputados com maior volume líquido">
            {metrics.topDeputies.map((dep, idx) => {
              const showPhoto = Boolean(dep.url_foto) && !brokenImages[dep.id];
              const isHovered = hoveredIdx === idx;
              let xOffset = 0;
              if (!shouldReduce && hoveredIdx !== null) {
                if (idx > hoveredIdx) xOffset = 6;
                else if (idx < hoveredIdx) xOffset = -6;
              }

              return (
                <motion.button
                  key={dep.id}
                  type="button"
                  role="listitem"
                  className={`avatar-cluster__item ${isHovered ? 'avatar-cluster__item--active' : ''}`}
                  aria-label={`#${idx + 1} ${dep.nome_parlamentar} (${dep.partido ?? 'S/P'}) — ${formatBRL(dep.total_liquido)}. Abrir perfil`}
                  onClick={() => onOpenDeputy(dep.id)}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onFocus={() => setHoveredIdx(idx)}
                  onBlur={() => setHoveredIdx(null)}
                  animate={{
                    x: xOffset,
                    y: isHovered && !shouldReduce ? -5 : 0,
                    scale: isHovered && !shouldReduce ? 1.12 : 1,
                    zIndex: isHovered ? 20 : metrics.topDeputies.length - idx,
                  }}
                  transition={shouldReduce ? INSTANT_TRANSITION : AVATAR_SPRING}
                >
                  {showPhoto ? (
                    <img
                      src={dep.url_foto!}
                      alt=""
                      className="avatar-cluster__img"
                      loading="lazy"
                      onError={() => onImageError(dep.id)}
                    />
                  ) : (
                    <span className="avatar-cluster__fallback" aria-hidden="true">
                      {getInitials(dep.nome_parlamentar)}
                    </span>
                  )}
                  <span className="avatar-cluster__rank-dot mono tabular" aria-hidden="true">
                    {idx + 1}
                  </span>
                </motion.button>
              );
            })}

            {overflowCount > 0 ? (
              <span
                className="avatar-cluster__overflow mono tabular"
                title={`Mais ${overflowCount} parlamentares neste recorte`}
              >
                +{formatInt(overflowCount)}
              </span>
            ) : null}
          </div>

          <div className="avatar-cluster__readout" aria-live="polite">
            {activeDeputy ? (
              <>
                <span className="avatar-cluster__readout-name">
                  <span className="mono tabular">#{activeRank}</span> {activeDeputy.nome_parlamentar}{' '}
                  <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>
                    ({activeDeputy.partido ?? 'S/P'})
                  </span>
                </span>
                <span className="avatar-cluster__readout-val mono tabular">
                  {formatBRLCompact(activeDeputy.total_liquido)} ·{' '}
                  {formatPct(activeDeputy.percentual_no_recorte)}
                </span>
              </>
            ) : (
              <span>Sem parlamentares no recorte</span>
            )}
          </div>
        </div>
      </div>

      {/* Cell 2: Top N Concentration Share */}
      <div className="deputies-bento__cell">
        <div className="deputies-bento__kicker">
          <span>Concentração Top {metrics.topCount}</span>
          <span className="mono tabular">{formatBRLCompact(metrics.topTotal)}</span>
        </div>

        <div className="deputies-bento__metric-row">
          <span className="deputies-bento__big tabular">{formatPct(metrics.topSharePct)}</span>
          <span className="deputies-bento__sub-mono mono tabular">do total da UF</span>
        </div>

        <div>
          <div className="deputies-bento__mini-bar" aria-hidden="true">
            <motion.div
              className={`deputies-bento__mini-fill ${
                isConcentrationHigh ? 'deputies-bento__mini-fill--warn' : ''
              }`}
              initial={shouldReduce ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={shouldReduce ? INSTANT_TRANSITION : BAR_SPRING}
              style={{ width: `${Math.min(100, Math.max(4, metrics.topSharePct))}%` }}
            />
          </div>
          <p className="deputies-bento__caption" style={{ marginTop: 6 }}>
            Soma dos {metrics.topCount} maiores volumes líquidos sobre {formatBRLCompact(metrics.sliceTotal)}.
          </p>
        </div>
      </div>

      {/* Cell 3: Average & Median per Deputy + CEAP Alert Count */}
      <div className="deputies-bento__cell">
        <div className="deputies-bento__kicker">
          <span>Média e mediana / dep.</span>
        </div>

        <div className="deputies-bento__metric-row">
          <span className="deputies-bento__big tabular">{formatBRLCompact(metrics.sliceAverage)}</span>
          <span className="deputies-bento__sub-mono mono tabular">
            med. {formatBRLCompact(metrics.sliceMedian)}
          </span>
        </div>

        {metrics.warnCount > 0 ? (
          <span className="deputies-bento__alert-chip tabular">
            <AlertTriangle size={12} aria-hidden="true" />
            {formatInt(metrics.warnCount)}{' '}
            {metrics.warnCount === 1 ? 'parlamentar' : 'parlamentares'} ≥ {CEAP_WARN_THRESHOLD_PCT}%
            do teto est.
          </span>
        ) : (
          <span className="deputies-bento__alert-chip deputies-bento__alert-chip--ok">
            <CheckCircle2 size={12} aria-hidden="true" />
            Todos abaixo de {CEAP_WARN_THRESHOLD_PCT}% do teto est.
          </span>
        )}
      </div>

      {/* Cell 4: Bench Coverage */}
      <div className="deputies-bento__cell">
        <div className="deputies-bento__kicker">
          <span>Bancada no recorte</span>
          <span className="mono tabular">{selectedUf}</span>
        </div>

        <div className="deputies-bento__metric-row">
          <span className="deputies-bento__big tabular">{formatInt(totalDeputies)}</span>
          <span className="deputies-bento__sub-mono mono tabular">
            {formatInt(metrics.partyCount)} {metrics.partyCount === 1 ? 'partido' : 'partidos'}
          </span>
        </div>

        <p className="deputies-bento__caption tabular">
          {formatInt(metrics.activeCount)} com despesas líquidas registradas em {selectedAno} · Total{' '}
          <strong className="mono">{formatBRLCompact(metrics.sliceTotal)}</strong>.
        </p>
      </div>
    </div>
  );
});

interface DeputyCardItemProps {
  dep: DeputadoCardOut;
  rank: number;
  totalInSlice: number;
  sliceAverage: number;
  selectedAno: number;
  isImageBroken: boolean;
  onImageError: (id: number) => void;
  onOpenDeputy: (id: number) => void;
}

const DeputyCardItem = memo(function DeputyCardItem({
  dep,
  rank,
  totalInSlice,
  sliceAverage,
  selectedAno,
  isImageBroken,
  onImageError,
  onOpenDeputy,
}: DeputyCardItemProps) {
  const shouldReduce = useReducedMotion();
  const showPhoto = Boolean(dep.url_foto) && !isImageBroken;

  return (
    <motion.article
      className="deputy-card deputy-card--editorial"
      whileHover={shouldReduce ? undefined : { y: -2 }}
      transition={shouldReduce ? INSTANT_TRANSITION : CARD_HOVER_TRANSITION}
    >
      <div>
        <div className="deputy-card__head-wrap">
          <div className="deputy-head" style={{ minWidth: 0 }}>
            {showPhoto ? (
              <img
                src={dep.url_foto!}
                alt={`Foto oficial de ${dep.nome_parlamentar}`}
                className="deputy-avatar"
                loading="lazy"
                onError={() => onImageError(dep.id)}
              />
            ) : (
              <div className="deputy-avatar-fallback" aria-hidden="true">
                {dep.url_foto ? getInitials(dep.nome_parlamentar) : <UserRound size={22} />}
              </div>
            )}

            <div style={{ minWidth: 0 }}>
              <h3 className="deputy-name">
                <button
                  type="button"
                  className="deputy-card__name-btn"
                  onClick={() => onOpenDeputy(dep.id)}
                >
                  {dep.nome_parlamentar}
                </button>
              </h3>
              <div className="deputy-meta-row">
                <span>{dep.partido ?? 'Sem partido'}</span>
                <span aria-hidden="true">·</span>
                <span>{dep.uf}</span>
                {dep.situacao_atual ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{dep.situacao_atual}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <span
            className={`deputy-card__rank-badge mono tabular ${
              rank <= 3 ? 'deputy-card__rank-badge--top' : ''
            }`}
            title={`Posição #${rank} de ${totalInSlice} em volume líquido no recorte`}
          >
            #{rank}
          </span>
        </div>

        <div className="deputy-metrics" style={{ marginTop: 14 }}>
          <div>
            <span className="deputy-metric-label">Total líquido ({selectedAno})</span>
            <span className="deputy-metric-val mono tabular">{formatBRL(dep.total_liquido)}</span>
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

        <div style={{ marginTop: 12 }}>
          <CeapUsageMeter
            variant="compact"
            totalLiquido={dep.total_liquido}
            uf={dep.uf}
            ano={selectedAno}
            rank={rank}
            totalInSlice={totalInSlice}
            percentualNoRecorte={dep.percentual_no_recorte}
            sliceAverage={sliceAverage}
          />
        </div>
      </div>

      <div className="deputy-actions">
        <button type="button" className="btn btn-sm" onClick={() => onOpenDeputy(dep.id)}>
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
});

interface DeputyTableRowProps {
  dep: DeputadoCardOut;
  rank: number;
  maxLiquido: number;
  selectedAno: number;
  isImageBroken: boolean;
  onImageError: (id: number) => void;
  onOpenDeputy: (id: number) => void;
}

const DeputyTableRow = memo(function DeputyTableRow({
  dep,
  rank,
  maxLiquido,
  selectedAno,
  isImageBroken,
  onImageError,
  onOpenDeputy,
}: DeputyTableRowProps) {
  const shouldReduce = useReducedMotion();
  const showPhoto = Boolean(dep.url_foto) && !isImageBroken;
  const ceiling = getEstimatedAnnualCeapCeiling(dep.uf, selectedAno);
  const utilizationPct = ceiling.annual > 0 ? (Math.max(0, dep.total_liquido) / ceiling.annual) * 100 : 0;
  const isWarn = utilizationPct >= CEAP_WARN_THRESHOLD_PCT;
  const proportionalPct =
    maxLiquido > 0 ? Math.min(100, Math.max(2, (Math.max(0, dep.total_liquido) / maxLiquido) * 100)) : 0;

  return (
    <tr>
      <td className="deputies-table__col-rank">
        <span
          className={`deputy-card__rank-badge mono tabular ${
            rank <= 3 ? 'deputy-card__rank-badge--top' : ''
          }`}
        >
          #{rank}
        </span>
      </td>

      <td className="deputies-table__col-dep">
        <div className="deputies-table__dep-cell">
          {showPhoto ? (
            <img
              src={dep.url_foto!}
              alt=""
              className="deputies-table__avatar"
              loading="lazy"
              onError={() => onImageError(dep.id)}
            />
          ) : (
            <span className="deputies-table__avatar-fallback" aria-hidden="true">
              {getInitials(dep.nome_parlamentar)}
            </span>
          )}

          <div className="deputies-table__dep-text">
            <button
              type="button"
              className="deputies-table__dep-name"
              onClick={() => onOpenDeputy(dep.id)}
              title={`Abrir perfil de ${dep.nome_parlamentar}`}
            >
              {dep.nome_parlamentar}
            </button>
            <div className="deputies-table__dep-meta">
              <span>{dep.partido ?? 'S/P'}</span>
              <span aria-hidden="true">·</span>
              <span>{dep.uf}</span>
              <span className="deputies-table__mobile-only">
                · {formatInt(dep.qtd_despesas)} lanç.
              </span>
              {isWarn ? (
                <span
                  className="deputies-table__warn-dot mono tabular"
                  title={`Consumo estimado de ${formatPct(utilizationPct)} do teto anual CEAP/${ceiling.ufCode}`}
                >
                  <AlertTriangle size={10} aria-hidden="true" />
                  {formatPct(utilizationPct)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </td>

      <td className="deputies-table__col-launches num-col">
        <span className="tabular">{formatInt(dep.qtd_despesas)}</span>
        <span className="deputies-table__sub-pct tabular">{formatPct(dep.percentual_no_recorte)}</span>
      </td>

      <td className="deputies-table__col-total num-col">
        <span className="deputies-table__total-val mono tabular">{formatBRL(dep.total_liquido)}</span>
        <span className="deputies-table__sub-pct mono tabular deputies-table__mobile-only">
          {formatPct(dep.percentual_no_recorte)} recorte
        </span>
      </td>

      <td className="deputies-table__col-bar">
        <div className="deputies-inline-bar">
          <div
            className="deputies-inline-bar__track"
            role="img"
            aria-label={`Barra proporcional: ${formatPct(proportionalPct)} do maior volume no recorte; ${formatPct(utilizationPct)} do teto anual estimado`}
          >
            <motion.div
              className={`deputies-inline-bar__fill ${
                isWarn ? 'deputies-inline-bar__fill--warn' : ''
              }`}
              initial={shouldReduce ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={shouldReduce ? INSTANT_TRANSITION : BAR_SPRING}
              style={{ width: `${proportionalPct.toFixed(1)}%` }}
            />
          </div>
          <div className="deputies-inline-bar__meta mono tabular">
            <span className={isWarn ? 'deputies-inline-bar__meta--warn' : undefined}>
              {formatPct(utilizationPct)} teto est.
            </span>
            <span>{formatPct(dep.percentual_no_recorte)} UF</span>
          </div>
        </div>
      </td>

      <td className="deputies-table__col-actions">
        <div className="deputies-table__actions">
          <button
            type="button"
            className="btn btn-sm"
            style={{ padding: '4px 9px', minHeight: 28, fontSize: '0.76rem' }}
            onClick={() => onOpenDeputy(dep.id)}
          >
            Perfil
            <ArrowRight size={12} />
          </button>
          <a
            href={dep.link_oficial}
            target="_blank"
            rel="noreferrer"
            className="deputies-table__ext-link"
            aria-label={`Abrir página oficial de ${dep.nome_parlamentar} na Câmara`}
            title="Portal oficial da Câmara"
          >
            <ExternalLink size={13} />
          </a>
        </div>
      </td>
    </tr>
  );
});

export function DeputiesSection({
  deputados,
  loading,
  selectedUf,
  selectedAno,
  hasData,
  onOpenDeputy,
  overview = null,
}: DeputiesSectionProps) {
  const shouldReduce = useReducedMotion();
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPartido, setSelectedPartido] = useState('');
  const [sortBy, setSortBy] = useState<SortMode>('total_desc');
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});

  const deferredSearch = useDeferredValue(searchTerm);
  const isSearchStale = searchTerm !== deferredSearch;

  const ufLabel = overview?.uf_nome ?? UF_NAME_MAP.get(selectedUf) ?? selectedUf;

  const handleImageError = useCallback((id: number) => {
    setBrokenImages((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  }, []);

  const handleViewModeChange = useCallback((next: ViewMode) => {
    startTransition(() => {
      setViewMode(next);
    });
  }, []);

  // Single-pass aggregation for rank map, parties, and Bento summary strip
  const { partidosDisponiveis, rankById, bentoMetrics } = useMemo(() => {
    const partySet = new Set<string>();
    const sortedByVolume = [...deputados].sort((a, b) => b.total_liquido - a.total_liquido);
    const ranks = new Map<number, number>();
    const totals: number[] = [];

    let sliceTotal = 0;
    let activeCount = 0;
    let warnCount = 0;
    let maxLiquido = 0;

    for (let i = 0; i < sortedByVolume.length; i += 1) {
      const dep = sortedByVolume[i];
      ranks.set(dep.id, i + 1);
      if (dep.partido) partySet.add(dep.partido);

      const val = dep.total_liquido;
      sliceTotal += val;
      totals.push(val);
      if (val > 0 || dep.qtd_despesas > 0) activeCount += 1;
      if (val > maxLiquido) maxLiquido = val;

      const ceiling = getEstimatedAnnualCeapCeiling(dep.uf, selectedAno);
      if (ceiling.annual > 0 && (val / ceiling.annual) * 100 >= CEAP_WARN_THRESHOLD_PCT) {
        warnCount += 1;
      }
    }

    const effectiveTotal =
      overview && overview.uf === selectedUf && overview.ano === selectedAno && overview.total_liquido > 0
        ? overview.total_liquido
        : sliceTotal;

    const count = sortedByVolume.length;
    const sliceAverage = count > 0 ? sliceTotal / count : 0;

    // totals is already descending -> median directly without re-sorting
    let sliceMedian = 0;
    if (count > 0) {
      const mid = Math.floor(count / 2);
      sliceMedian = count % 2 === 1 ? totals[mid] : (totals[mid - 1] + totals[mid]) / 2;
    }

    const topCount = Math.min(5, count);
    let topTotal = 0;
    for (let i = 0; i < topCount; i += 1) {
      topTotal += sortedByVolume[i].total_liquido;
    }
    const topSharePct = effectiveTotal > 0 ? (topTotal / effectiveTotal) * 100 : 0;

    return {
      partidosDisponiveis: Array.from(partySet).sort(),
      rankById: ranks,
      bentoMetrics: {
        topDeputies: sortedByVolume.slice(0, 6),
        topCount,
        topTotal,
        topSharePct,
        sliceTotal: effectiveTotal,
        sliceAverage,
        sliceMedian,
        activeCount,
        partyCount: partySet.size,
        warnCount,
        maxLiquido: Math.max(maxLiquido, 1),
      },
    };
  }, [deputados, overview, selectedUf, selectedAno]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
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
        return b.qtd_despesas - a.qtd_despesas || b.total_liquido - a.total_liquido;
      }
      return b.total_liquido - a.total_liquido;
    });
  }, [deputados, deferredSearch, selectedPartido, sortBy]);

  return (
    <section id="parlamentares" className="page-section page-section--alt">
      <div className="container">
        <div className="section-header deputies-header">
          <div>
            <h2 className="section-title">Parlamentares do recorte</h2>
            <p className="section-subtitle">
              Deputados associados a {ufLabel} ({selectedUf}) nas legislaturas vigentes em{' '}
              {selectedAno}. Compare o uso estimado da cota CEAP ou abra o perfil individual para
              auditar fornecedores e notas fiscais.
            </p>
          </div>

          {hasData && deputados.length > 0 ? (
            <div className="deputies-header__controls">
              <div
                className="deputies-view-toggle"
                role="group"
                aria-label="Modo de visualização dos parlamentares"
              >
                <button
                  type="button"
                  className="deputies-view-toggle__btn"
                  aria-pressed={viewMode === 'cards'}
                  onClick={() => handleViewModeChange('cards')}
                >
                  {viewMode === 'cards' ? (
                    <motion.span
                      layoutId="deputies-view-pill"
                      className="deputies-view-toggle__pill"
                      transition={shouldReduce ? INSTANT_TRANSITION : PILL_SPRING}
                    />
                  ) : null}
                  <LayoutGrid size={14} aria-hidden="true" />
                  Cards
                </button>
                <button
                  type="button"
                  className="deputies-view-toggle__btn"
                  aria-pressed={viewMode === 'table'}
                  onClick={() => handleViewModeChange('table')}
                >
                  {viewMode === 'table' ? (
                    <motion.span
                      layoutId="deputies-view-pill"
                      className="deputies-view-toggle__pill"
                      transition={shouldReduce ? INSTANT_TRANSITION : PILL_SPRING}
                    />
                  ) : null}
                  <Table2 size={14} aria-hidden="true" />
                  Tabela
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Bento Summary Strip with Overlapping Avatar Stack */}
        {hasData && deputados.length > 0 ? (
          <DeputiesBentoStrip
            metrics={bentoMetrics}
            totalDeputies={deputados.length}
            selectedUf={selectedUf}
            selectedAno={selectedAno}
            ufLabel={ufLabel}
            brokenImages={brokenImages}
            onImageError={handleImageError}
            onOpenDeputy={onOpenDeputy}
          />
        ) : null}

        <div className="filter-bar deputies-filter-bar">
          <div className="deputies-search-wrap">
            <Search
              size={15}
              color="var(--ink-muted)"
              className="deputies-search-icon"
              aria-hidden="true"
            />
            <input
              type="search"
              className="input-field deputies-search-input"
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
            onChange={(e) => {
              const val = e.target.value;
              startTransition(() => setSelectedPartido(val));
            }}
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
            onChange={(e) => {
              const val = e.target.value as SortMode;
              startTransition(() => setSortBy(val));
            }}
          >
            <option value="total_desc">Maior volume líquido no recorte</option>
            <option value="qtd_desc">Mais lançamentos carregados</option>
            <option value="nome_asc">Ordem alfabética (A–Z)</option>
          </select>

          <span className="deputies-count-note tabular">
            Exibindo {formatInt(filtered.length)} de {formatInt(deputados.length)}
          </span>
        </div>

        {loading && deputados.length === 0 ? (
          <div className="deputies-grid deputies-grid--enhanced">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="deputy-card">
                <div className="skeleton-block" style={{ height: 56, width: '100%' }} />
                <div className="skeleton-block" style={{ height: 52, width: '100%' }} />
                <div className="skeleton-block" style={{ height: 34, width: '100%' }} />
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
          <div className={isSearchStale ? 'deputies-results--stale' : undefined}>
            <AnimatePresence mode="wait" initial={false}>
              {viewMode === 'cards' ? (
                <motion.div
                  key="cards-view"
                  className="deputies-grid deputies-grid--enhanced"
                  initial={shouldReduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduce ? undefined : { opacity: 0, y: -6 }}
                  transition={shouldReduce ? INSTANT_TRANSITION : CARD_HOVER_TRANSITION}
                >
                  {filtered.map((dep) => (
                    <DeputyCardItem
                      key={dep.id}
                      dep={dep}
                      rank={rankById.get(dep.id) ?? 1}
                      totalInSlice={deputados.length}
                      sliceAverage={bentoMetrics.sliceAverage}
                      selectedAno={selectedAno}
                      isImageBroken={Boolean(brokenImages[dep.id])}
                      onImageError={handleImageError}
                      onOpenDeputy={onOpenDeputy}
                    />
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="table-view"
                  className="deputies-table-wrap"
                  initial={shouldReduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduce ? undefined : { opacity: 0, y: -6 }}
                  transition={shouldReduce ? INSTANT_TRANSITION : CARD_HOVER_TRANSITION}
                >
                  <table className="deputies-table">
                    <thead>
                      <tr>
                        <th className="deputies-table__col-rank">Pos.</th>
                        <th className="deputies-table__col-dep">Parlamentar</th>
                        <th className="deputies-table__col-launches num-col">Lançam.</th>
                        <th className="deputies-table__col-total num-col">Total líquido</th>
                        <th className="deputies-table__col-bar">Proporção &amp; teto CEAP est.</th>
                        <th className="deputies-table__col-actions num-col">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((dep) => (
                        <DeputyTableRow
                          key={dep.id}
                          dep={dep}
                          rank={rankById.get(dep.id) ?? 1}
                          maxLiquido={bentoMetrics.maxLiquido}
                          selectedAno={selectedAno}
                          isImageBroken={Boolean(brokenImages[dep.id])}
                          onImageError={handleImageError}
                          onOpenDeputy={onOpenDeputy}
                        />
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  );
}
