import { memo, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { UfComparacaoOut } from '../../types/api';
import { formatBRL, formatBRLCompact, formatInt } from '../../utils/format';
import { EDITORIAL_EASE, INSTANT_TRANSITION } from './chartMotion';
import { SegmentedTabs, type TabOption } from './SegmentedTabs';

export type UfSortKey = 'media' | 'total' | 'alpha';

const UF_SORT_OPTIONS: readonly TabOption<UfSortKey>[] = [
  { id: 'media', label: 'Média / dep.' },
  { id: 'total', label: 'Total' },
  { id: 'alpha', label: 'A–Z' },
] as const;

interface UfComparisonPanelProps {
  rows: UfComparacaoOut[];
  selectedUf: string;
  selectedAno: number;
  viewMode: 'comparativo' | 'tabela';
  onSelectUf: (uf: string) => void;
}

interface RankedUfRow {
  row: UfComparacaoOut;
  rank: number;
  metricValue: number;
  exactPct: number;
  isSelected: boolean;
}

interface TwinTableColumnProps {
  items: RankedUfRow[];
  sortBy: UfSortKey;
  hoveredUf: string | null;
  shouldReduce: boolean;
  onHoverUf: (uf: string | null) => void;
  onSelectUf: (uf: string) => void;
}

const TwinTableColumn = memo(function TwinTableColumn({
  items,
  sortBy,
  hoveredUf,
  shouldReduce,
  onHoverUf,
  onSelectUf,
}: TwinTableColumnProps) {
  const metricHeader = sortBy === 'total' ? 'Total líquido' : 'Média / dep.';

  return (
    <div className="uf-twin-col">
      <table className="uf-twin-table">
        <thead>
          <tr>
            <th scope="col">UF · Bancada</th>
            <th scope="col" className="num-col">
              {metricHeader}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ row, rank, metricValue, exactPct, isSelected }, idx) => {
            const dimmed = hoveredUf !== null && hoveredUf !== row.uf;
            const secondaryText =
              sortBy === 'total'
                ? `Média ${formatBRLCompact(row.media_por_deputado)}`
                : `Total ${formatBRLCompact(row.total_liquido)}`;

            return (
              <tr
                key={row.uf}
                className={`uf-twin-row${isSelected ? ' uf-twin-row--active' : ''}`}
                style={{ opacity: dimmed ? 0.48 : 1 }}
                onMouseEnter={() => onHoverUf(row.uf)}
                onMouseLeave={() => onHoverUf(null)}
              >
                <td className="uf-twin-name-cell">
                  <div className="uf-twin-head">
                    <span className="uf-twin-rank mono tabular">
                      {String(rank).padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      className={`uf-twin-btn${isSelected ? ' uf-twin-btn--active' : ''}`}
                      onClick={() => onSelectUf(row.uf)}
                      title={`Selecionar ${row.uf} — ${row.uf_nome} (${formatInt(row.qtd_deputados)} dep.)`}
                    >
                      <span className="uf-twin-code mono">{row.uf}</span>
                      <span className="uf-twin-fullname">{row.uf_nome}</span>
                    </button>
                    {isSelected ? (
                      <span className="uf-active-badge">Ativa</span>
                    ) : (
                      <span className="uf-dep-count tabular">{row.qtd_deputados} dep.</span>
                    )}
                  </div>

                  {/* Exact proportional horizontal bar — zero minimum-floor distortion */}
                  <div
                    className="uf-bar-track"
                    role="progressbar"
                    aria-label={`Proporção de ${row.uf_nome}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Number(exactPct.toFixed(1))}
                  >
                    <motion.div
                      className={`uf-bar-fill${isSelected ? ' uf-bar-fill--active' : ''}`}
                      data-uf={row.uf}
                      data-pct={exactPct.toFixed(2)}
                      initial={shouldReduce ? false : { scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={
                        shouldReduce
                          ? INSTANT_TRANSITION
                          : { duration: 0.42, delay: Math.min(idx * 0.03, 0.25), ease: EDITORIAL_EASE }
                      }
                      style={{ width: `${exactPct.toFixed(2)}%` }}
                    />
                  </div>
                </td>

                <td className="uf-twin-val-cell num-col">
                  <strong
                    className="uf-twin-metric mono tabular"
                    title={formatBRL(metricValue)}
                  >
                    {formatBRLCompact(metricValue)}
                  </strong>
                  <span className="uf-twin-secondary tabular">{secondaryText}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

/**
 * Comparação entre UFs já coletadas — Parte A.3 fix + Parte B.3:
 * - Ordenação interativa: Média / dep. | Total | A–Z
 * - Largura das barras estritamente proporcional ao valor da métrica ativa (0..100%, sem piso artificial)
 * - Destaque editorial terracota na UF ativa (`selectedUf`)
 * - Tabelas editoriais gêmeas equilibradas em 2 colunas no desktop e 1 coluna em telas estreitas
 */
export const UfComparisonPanel = memo(function UfComparisonPanel({
  rows,
  selectedUf,
  selectedAno,
  viewMode,
  onSelectUf,
}: UfComparisonPanelProps) {
  const shouldReduce = Boolean(useReducedMotion());
  const [sortBy, setSortBy] = useState<UfSortKey>('media');
  const [hoveredUf, setHoveredUf] = useState<string | null>(null);

  const rankedRows = useMemo<RankedUfRow[]>(() => {
    if (rows.length === 0) return [];

    let maxMedia = 0;
    let maxTotal = 0;
    for (const r of rows) {
      if (r.media_por_deputado > maxMedia) maxMedia = r.media_por_deputado;
      if (r.total_liquido > maxTotal) maxTotal = r.total_liquido;
    }

    const sorted = [...rows].sort((a, b) => {
      if (sortBy === 'total') {
        return b.total_liquido - a.total_liquido || a.uf.localeCompare(b.uf);
      }
      if (sortBy === 'alpha') {
        return a.uf.localeCompare(b.uf, 'pt-BR');
      }
      return b.media_por_deputado - a.media_por_deputado || a.uf.localeCompare(b.uf);
    });

    const useTotalScale = sortBy === 'total';
    const denom = useTotalScale ? maxTotal : maxMedia;

    return sorted.map((row, idx) => {
      const metricValue = useTotalScale ? row.total_liquido : row.media_por_deputado;
      const positiveVal = Math.max(0, metricValue);
      const exactPct = denom > 0 ? Math.min(100, (positiveVal / denom) * 100) : 0;
      return {
        row,
        rank: idx + 1,
        metricValue,
        exactPct,
        isSelected: row.uf === selectedUf,
      };
    });
  }, [rows, sortBy, selectedUf]);

  const { leftRows, rightRows } = useMemo(() => {
    if (rankedRows.length <= 1) {
      return { leftRows: rankedRows, rightRows: [] as RankedUfRow[] };
    }
    const splitAt = Math.ceil(rankedRows.length / 2);
    return {
      leftRows: rankedRows.slice(0, splitAt),
      rightRows: rankedRows.slice(splitAt),
    };
  }, [rankedRows]);

  if (rows.length === 0) {
    return (
      <p style={{ color: 'var(--ink-muted)' }}>
        Ainda não há múltiplas UFs coletadas para o ano {selectedAno}. Colete outro estado para
        habilitar esta comparação.
      </p>
    );
  }

  return (
    <div className="uf-panel">
      <div className="uf-panel-toolbar">
        <span className="uf-panel-count tabular">
          {rows.length} {rows.length === 1 ? 'UF coletada' : 'UFs coletadas'} · barras em escala
          exata ({sortBy === 'total' ? 'Total' : 'Média / dep.'})
        </span>
        <SegmentedTabs
          groupId={`uf-sort-${selectedAno}`}
          value={sortBy}
          size="sm"
          label="Ordenar comparação entre UFs"
          options={UF_SORT_OPTIONS}
          onChange={setSortBy}
        />
      </div>

      {viewMode === 'comparativo' ? (
        <div
          className={`uf-twin-grid${rightRows.length === 0 ? ' uf-twin-grid--single' : ''}`}
          aria-label="Tabelas comparativas gêmeas entre UFs"
        >
          <TwinTableColumn
            items={leftRows}
            sortBy={sortBy}
            hoveredUf={hoveredUf}
            shouldReduce={shouldReduce}
            onHoverUf={setHoveredUf}
            onSelectUf={onSelectUf}
          />
          {rightRows.length > 0 ? (
            <TwinTableColumn
              items={rightRows}
              sortBy={sortBy}
              hoveredUf={hoveredUf}
              shouldReduce={shouldReduce}
              onHoverUf={setHoveredUf}
              onSelectUf={onSelectUf}
            />
          ) : null}
        </div>
      ) : (
        <div className="table-scroll uf-full-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>UF</th>
                <th className="num-col">Deputados</th>
                <th className="num-col">Notas</th>
                <th className="num-col">Média / dep.</th>
                <th className="num-col">Total líquido</th>
              </tr>
            </thead>
            <tbody>
              {rankedRows.map(({ row, isSelected }) => (
                <tr
                  key={row.uf}
                  className={isSelected ? 'uf-table-row--active' : undefined}
                >
                  <td>
                    <button
                      type="button"
                      className={`uf-twin-btn${isSelected ? ' uf-twin-btn--active' : ''}`}
                      onClick={() => onSelectUf(row.uf)}
                    >
                      <span className="uf-twin-code mono">{row.uf}</span>
                      <span>{row.uf_nome}</span>
                    </button>
                    {isSelected ? <span className="uf-active-badge">Ativa</span> : null}
                  </td>
                  <td className="num-col">{formatInt(row.qtd_deputados)}</td>
                  <td className="num-col">{formatInt(row.qtd_despesas)}</td>
                  <td className="num-col">{formatBRL(row.media_por_deputado)}</td>
                  <td className="num-col">{formatBRL(row.total_liquido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
