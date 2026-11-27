import { memo, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { DeputadoCardOut, DeputadoComparacaoOut } from '../../types/api';
import { formatBRL, formatBRLCompact, formatInt, formatPct } from '../../utils/format';
import {
  clamp,
  getInitials,
  INSTANT_TRANSITION,
  PARTY_PALETTE,
  r1,
  SPRING_SNAPPY,
  SPRING_TOOLTIP,
} from './chartMotion';
import { SegmentedTabs, type TabOption } from './SegmentedTabs';

type ClusterMode = 'partido' | 'faixa';

const CLUSTER_MODE_OPTIONS: readonly TabOption<ClusterMode>[] = [
  { id: 'partido', label: 'Por partido' },
  { id: 'faixa', label: 'Por faixa de gasto' },
] as const;

interface HexbinClusterChartProps {
  selectedUf: string;
  selectedAno: number;
  deputies: DeputadoComparacaoOut[];
  deputadosCards?: DeputadoCardOut[];
  onOpenDeputy: (id: number) => void;
}

interface HexCell {
  dep: DeputadoComparacaoOut;
  clusterId: string;
  clusterLabel: string;
  cx: number;
  cy: number;
  xPct: number;
  yPct: number;
  fill: string;
  hoverFill: string;
  inkColor: string;
  points: string;
  initials: string;
  fotoUrl: string | null;
  sharePct: number | null;
}

interface ClusterLegendItem {
  id: string;
  label: string;
  count: number;
  color: string;
  total: number;
  centerX: number;
  labelY: number;
}

/** Generate axial (q, r) coordinates in a compact honeycomb spiral around (0, 0) */
function axialSpiral(count: number): { q: number; r: number }[] {
  if (count <= 0) return [];
  const results: { q: number; r: number }[] = [{ q: 0, r: 0 }];
  if (count === 1) return results;

  const dirs: [number, number][] = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ];

  let ring = 1;
  while (results.length < count) {
    let q = -ring;
    let r = ring;
    for (let side = 0; side < 6 && results.length < count; side++) {
      const [dq, dr] = dirs[side];
      for (let step = 0; step < ring && results.length < count; step++) {
        results.push({ q, r });
        q += dq;
        r += dr;
      }
    }
    ring += 1;
  }
  return results;
}

/** Pointy-top hexagon polygon vertices rounded to 1 decimal place */
function hexPolygonPoints(cx: number, cy: number, radius: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${r1(cx + radius * Math.cos(angle))},${r1(cy + radius * Math.sin(angle))}`);
  }
  return pts.join(' ');
}

const SQRT3 = Math.sqrt(3);

/**
 * Agrupamento Hexagonal (Hexbin) — Parte B.3
 * Agrupa parlamentares por partido ou faixa de gasto em colmeias hexagonais.
 * Clicar em qualquer hexágono abre o perfil completo do deputado (`onOpenDeputy`).
 */
export const HexbinClusterChart = memo(function HexbinClusterChart({
  selectedUf,
  selectedAno,
  deputies,
  deputadosCards,
  onOpenDeputy,
}: HexbinClusterChartProps) {
  const shouldReduce = useReducedMotion();
  const [clusterMode, setClusterMode] = useState<ClusterMode>('partido');
  const [hoveredDepId, setHoveredDepId] = useState<number | null>(null);
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);

  const cardById = useMemo(() => {
    const map = new Map<number, DeputadoCardOut>();
    if (deputadosCards) {
      for (const c of deputadosCards) {
        map.set(c.id, c);
      }
    }
    return map;
  }, [deputadosCards]);

  const layout = useMemo(() => {
    const totalCount = deputies.length;
    if (totalCount === 0) {
      return {
        width: 560,
        height: 220,
        hexRadius: 20,
        showInitials: true,
        cells: [] as HexCell[],
        clusters: [] as ClusterLegendItem[],
      };
    }

    const totalSliceSum = deputies.reduce((acc, d) => acc + Math.max(0, d.total_liquido), 0) || 1;

    // 1. Group deputies into clusters
    interface RawGroup {
      id: string;
      label: string;
      color: string;
      hoverColor: string;
      inkColor: string;
      items: DeputadoComparacaoOut[];
      total: number;
    }

    const groups: RawGroup[] = [];

    if (clusterMode === 'faixa') {
      // 4 editorial terracotta quartiles matching REA #9 (#E8DFCE Q1 -> #DFB199 Q2 -> #CE6342 Q3 -> #B83628 Q4)
      const sortedBySpend = [...deputies].sort((a, b) => b.total_liquido - a.total_liquido);
      const qSize = Math.max(1, Math.ceil(sortedBySpend.length / 4));
      const q4 = sortedBySpend.slice(0, qSize);
      const q3 = sortedBySpend.slice(qSize, qSize * 2);
      const q2 = sortedBySpend.slice(qSize * 2, qSize * 3);
      const q1 = sortedBySpend.slice(qSize * 3);

      const tierDefs: {
        id: string;
        label: string;
        color: string;
        hoverColor: string;
        inkColor: string;
        items: DeputadoComparacaoOut[];
      }[] = [
        {
          id: 'q4',
          label: 'Q4 · Topo',
          color: '#B83628',
          hoverColor: '#96291D',
          inkColor: '#FAF7F0',
          items: q4,
        },
        {
          id: 'q3',
          label: 'Q3 · Alto',
          color: '#CE6342',
          hoverColor: '#B83628',
          inkColor: '#FAF7F0',
          items: q3,
        },
        {
          id: 'q2',
          label: 'Q2 · Médio',
          color: '#DFB199',
          hoverColor: '#CE6342',
          inkColor: '#25201A',
          items: q2,
        },
        {
          id: 'q1',
          label: 'Q1 · Base',
          color: '#E8DFCE',
          hoverColor: '#D6C7B0',
          inkColor: '#25201A',
          items: q1,
        },
      ];

      for (const td of tierDefs) {
        if (td.items.length > 0) {
          groups.push({
            id: td.id,
            label: td.label,
            color: td.color,
            hoverColor: td.hoverColor,
            inkColor: td.inkColor,
            items: td.items,
            total: td.items.reduce((a, x) => a + x.total_liquido, 0),
          });
        }
      }
    } else {
      const byParty = new Map<string, DeputadoComparacaoOut[]>();
      for (const d of deputies) {
        const key = (d.partido ?? 'S/P').trim() || 'S/P';
        const list = byParty.get(key);
        if (list) list.push(d);
        else byParty.set(key, [d]);
      }

      const sortedParties = Array.from(byParty.entries())
        .map(([party, items]) => ({
          party,
          items,
          total: items.reduce((acc, x) => acc + x.total_liquido, 0),
        }))
        .sort((a, b) => b.items.length - a.items.length || b.total - a.total);

      // Keep top 8 party islands cleanly, merge tiny tail into "Outros" if > 9 parties
      const maxClusters = 8;
      const mainParties =
        sortedParties.length > maxClusters + 1
          ? sortedParties.slice(0, maxClusters)
          : sortedParties;
      const tailParties =
        sortedParties.length > maxClusters + 1 ? sortedParties.slice(maxClusters) : [];

      mainParties.forEach((p, idx) => {
        const color = PARTY_PALETTE[idx % PARTY_PALETTE.length];
        groups.push({
          id: p.party,
          label: p.party,
          color,
          hoverColor: '#CE4233',
          inkColor: '#FAF7F0',
          items: p.items,
          total: p.total,
        });
      });

      if (tailParties.length > 0) {
        const merged = tailParties.flatMap((t) => t.items);
        groups.push({
          id: 'OUTROS',
          label: `Outros (${tailParties.length})`,
          color: '#7D7366',
          hoverColor: '#CE4233',
          inkColor: '#FAF7F0',
          items: merged,
          total: merged.reduce((acc, x) => acc + x.total_liquido, 0),
        });
      }
    }

    // 2. Choose hex radius dynamically so small & huge states (8..85 deputies) both look balanced
    const hexRadius =
      totalCount <= 12 ? 23 : totalCount <= 26 ? 18.5 : totalCount <= 50 ? 14.5 : 11.8;
    const innerRadius = r1(hexRadius * 0.91);
    const showInitials = hexRadius >= 14;

    // 3. Measure each cluster's local honeycomb bounding box
    const localClusters = groups.map((g) => {
      const coords = axialSpiral(g.items.length).map(({ q, r }) => ({
        lx: hexRadius * SQRT3 * (q + r / 2),
        ly: hexRadius * 1.5 * r,
      }));
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const c of coords) {
        if (c.lx < minX) minX = c.lx;
        if (c.lx > maxX) maxX = c.lx;
        if (c.ly < minY) minY = c.ly;
        if (c.ly > maxY) maxY = c.ly;
      }
      const w = maxX - minX + hexRadius * 2.1;
      const h = maxY - minY + hexRadius * 2.1;
      return {
        group: g,
        coords,
        minX,
        maxX,
        minY,
        maxY,
        w: Math.max(w, 82),
        h: Math.max(h, hexRadius * 2.2),
      };
    });

    // 4. Pack clusters into centered rows inside viewBox width = 560
    const VB_W = 560;
    const PAD_X = 20;
    const GAP_X = 24;
    const GAP_Y = 34;
    const LABEL_SPACE = 20;

    interface RowBucket {
      items: typeof localClusters;
      totalW: number;
      maxH: number;
    }

    const rows: RowBucket[] = [];
    let currentRow: RowBucket = { items: [], totalW: 0, maxH: 0 };

    for (const lc of localClusters) {
      const nextW = currentRow.items.length === 0 ? lc.w : currentRow.totalW + GAP_X + lc.w;
      if (currentRow.items.length > 0 && nextW > VB_W - PAD_X * 2) {
        rows.push(currentRow);
        currentRow = { items: [lc], totalW: lc.w, maxH: lc.h };
      } else {
        currentRow.items.push(lc);
        currentRow.totalW = nextW;
        currentRow.maxH = Math.max(currentRow.maxH, lc.h);
      }
    }
    if (currentRow.items.length > 0) rows.push(currentRow);

    const TOP_PAD = 18;
    const BOTTOM_PAD = 16;
    const totalH =
      TOP_PAD +
      rows.reduce((acc, row) => acc + row.maxH + LABEL_SPACE, 0) +
      Math.max(0, rows.length - 1) * GAP_Y +
      BOTTOM_PAD;
    const VB_H = Math.max(210, Math.ceil(totalH));

    const cells: HexCell[] = [];
    const clusters: ClusterLegendItem[] = [];

    let cursorY = TOP_PAD;
    for (const row of rows) {
      let cursorX = (VB_W - row.totalW) / 2;
      const rowMidY = cursorY + row.maxH / 2;

      for (const lc of row.items) {
        const boxCenterX = cursorX + lc.w / 2;
        const localCenterX = (lc.minX + lc.maxX) / 2;
        const localCenterY = (lc.minY + lc.maxY) / 2;

        lc.group.items.forEach((dep, idx) => {
          const { lx, ly } = lc.coords[idx];
          const cx = r1(boxCenterX + (lx - localCenterX));
          const cy = r1(rowMidY + (ly - localCenterY));
          const card = cardById.get(dep.deputado_id);

          cells.push({
            dep,
            clusterId: lc.group.id,
            clusterLabel: lc.group.label,
            cx,
            cy,
            xPct: (cx / VB_W) * 100,
            yPct: (cy / VB_H) * 100,
            fill: lc.group.color,
            hoverFill: lc.group.hoverColor,
            inkColor: lc.group.inkColor,
            points: hexPolygonPoints(cx, cy, innerRadius),
            initials: getInitials(dep.nome_parlamentar),
            fotoUrl: card?.url_foto ?? null,
            sharePct:
              card?.percentual_no_recorte ?? (Math.max(0, dep.total_liquido) / totalSliceSum) * 100,
          });
        });

        clusters.push({
          id: lc.group.id,
          label: lc.group.label,
          count: lc.group.items.length,
          color: lc.group.color,
          total: lc.group.total,
          centerX: r1(boxCenterX),
          labelY: r1(cursorY + row.maxH + 14),
        });

        cursorX += lc.w + GAP_X;
      }

      cursorY += row.maxH + LABEL_SPACE + GAP_Y;
    }

    return {
      width: VB_W,
      height: VB_H,
      hexRadius,
      showInitials,
      cells,
      clusters,
    };
  }, [deputies, clusterMode, cardById]);

  const activeCell = useMemo(() => {
    if (hoveredDepId === null) return null;
    return layout.cells.find((c) => c.dep.deputado_id === hoveredDepId) ?? null;
  }, [layout.cells, hoveredDepId]);

  const tooltipLeftPct = activeCell ? clamp(activeCell.xPct, 20, 80) : 50;
  const tooltipPlaceBelow = activeCell ? activeCell.yPct < 36 : false;

  if (deputies.length === 0) {
    return (
      <p style={{ color: 'var(--ink-muted)' }}>
        Sem parlamentares coletados para {selectedUf}/{selectedAno}.
      </p>
    );
  }

  return (
    <div className="hexbin-panel">
      <div className="hexbin-toolbar">
        <span className="hexbin-hint">
          {deputies.length} parlamentares · clique em qualquer hexágono para abrir o dossiê
        </span>
        <SegmentedTabs
          groupId={`hex-mode-${selectedUf}-${selectedAno}`}
          value={clusterMode}
          size="sm"
          label="Agrupar hexágonos por"
          options={CLUSTER_MODE_OPTIONS}
          onChange={(next) => {
            setHoveredDepId(null);
            setHoveredClusterId(null);
            setClusterMode(next);
          }}
        />
      </div>

      <div
        className="hexbin-stage"
        onMouseLeave={() => {
          setHoveredDepId(null);
          setHoveredClusterId(null);
        }}
      >
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="hexbin-svg"
          role="img"
          aria-label={`Mapa hexagonal de parlamentares de ${selectedUf} em ${selectedAno} agrupados ${
            clusterMode === 'partido' ? 'por partido' : 'por faixa de gasto'
          }`}
        >
          {/* Cluster captions */}
          {layout.clusters.map((cl) => {
            const isClusterDimmed =
              (hoveredClusterId !== null && hoveredClusterId !== cl.id) ||
              (activeCell !== null && activeCell.clusterId !== cl.id);
            return (
              <g
                key={`cl-label-${cl.id}`}
                style={{ opacity: isClusterDimmed ? 0.38 : 1, transition: 'opacity 140ms ease' }}
              >
                <text
                  x={cl.centerX}
                  y={cl.labelY}
                  textAnchor="middle"
                  fill="#25201A"
                  fontSize="10.5"
                  fontWeight="700"
                >
                  {cl.label}{' '}
                  <tspan fill="#6C6357" fontWeight="500">
                    ({cl.count})
                  </tspan>
                </text>
              </g>
            );
          })}

          {/* Interactive deputy hexagons */}
          {layout.cells.map((cell) => {
            const isHovered = hoveredDepId === cell.dep.deputado_id;
            const isSameCluster =
              hoveredClusterId === cell.clusterId || activeCell?.clusterId === cell.clusterId;
            const anyFocus = hoveredDepId !== null || hoveredClusterId !== null;
            const opacity = isHovered ? 1 : anyFocus ? (isSameCluster ? 0.8 : 0.3) : 0.92;

            return (
              <g
                key={cell.dep.deputado_id}
                className="hexbin-cell"
                tabIndex={0}
                role="button"
                aria-label={`${cell.dep.nome_parlamentar} (${cell.dep.partido ?? 'S/P'}): ${formatBRL(
                  cell.dep.total_liquido
                )}, ${formatInt(cell.dep.qtd_despesas)} notas. Abrir perfil`}
                onMouseEnter={() => {
                  setHoveredDepId(cell.dep.deputado_id);
                  setHoveredClusterId(null);
                }}
                onMouseLeave={() => setHoveredDepId(null)}
                onFocus={() => setHoveredDepId(cell.dep.deputado_id)}
                onBlur={() => setHoveredDepId(null)}
                onClick={() => onOpenDeputy(cell.dep.deputado_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenDeputy(cell.dep.deputado_id);
                  }
                }}
              >
                <polygon
                  points={cell.points}
                  fill={isHovered ? cell.hoverFill : cell.fill}
                  stroke={isHovered ? '#25201A' : '#FAF7F0'}
                  strokeWidth={isHovered ? 2.2 : 1.3}
                  style={{
                    opacity,
                    transition: shouldReduce
                      ? 'none'
                      : 'opacity 140ms ease, fill 140ms ease, stroke-width 140ms ease',
                  }}
                >
                  <title>
                    {cell.dep.nome_parlamentar} ({cell.dep.partido ?? 'S/P'}) ·{' '}
                    {formatBRL(cell.dep.total_liquido)} · {formatInt(cell.dep.qtd_despesas)} notas
                  </title>
                </polygon>
                {layout.showInitials ? (
                  <text
                    x={cell.cx}
                    y={r1(cell.cy + 3.4)}
                    textAnchor="middle"
                    fill={cell.inkColor}
                    fontSize={layout.hexRadius >= 20 ? '9.5' : '8'}
                    fontWeight="700"
                    className="mono"
                    pointerEvents="none"
                    style={{ opacity: isHovered ? 1 : opacity * 0.96 }}
                  >
                    {cell.initials}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        {/* Smooth floating HTML tooltip */}
        <AnimatePresence>
          {activeCell ? (
            <motion.div
              key="hex-tooltip"
              className={`hexbin-tooltip${tooltipPlaceBelow ? ' hexbin-tooltip--below' : ''}`}
              style={
                tooltipPlaceBelow
                  ? { left: `${tooltipLeftPct}%`, x: '-50%', top: `${r1(activeCell.yPct)}%` }
                  : { left: `${tooltipLeftPct}%`, x: '-50%', bottom: `${r1(100 - activeCell.yPct)}%` }
              }
              initial={shouldReduce ? false : { opacity: 0, scale: 0.96, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 3 }}
              transition={shouldReduce ? INSTANT_TRANSITION : SPRING_TOOLTIP}
              role="status"
              aria-live="polite"
            >
              <div className="hexbin-tooltip__head">
                {activeCell.fotoUrl ? (
                  <img
                    src={activeCell.fotoUrl}
                    alt=""
                    className="hexbin-tooltip__avatar"
                    loading="lazy"
                  />
                ) : (
                  <span
                    className="hexbin-tooltip__monogram"
                    style={{ backgroundColor: activeCell.fill }}
                    aria-hidden="true"
                  >
                    {activeCell.initials}
                  </span>
                )}
                <div className="hexbin-tooltip__id">
                  <strong className="serif-display">{activeCell.dep.nome_parlamentar}</strong>
                  <span className="hexbin-tooltip__party">
                    {activeCell.dep.partido ?? 'S/P'} · {activeCell.dep.uf}
                  </span>
                </div>
              </div>
              <div className="hexbin-tooltip__metrics tabular">
                <span className="hexbin-tooltip__total mono">
                  {formatBRL(activeCell.dep.total_liquido)}
                </span>
                <span className="hexbin-tooltip__sub">
                  {formatInt(activeCell.dep.qtd_despesas)} notas
                  {activeCell.sharePct !== null
                    ? ` · ${formatPct(activeCell.sharePct)} do recorte`
                    : ''}
                </span>
              </div>
              <div className="hexbin-tooltip__cta">Clique no hexágono para abrir o perfil →</div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Interactive cluster legend pills */}
      <div className="hexbin-legend" role="list" aria-label="Legenda dos agrupamentos">
        {layout.clusters.map((cl) => {
          const isActive = hoveredClusterId === cl.id || activeCell?.clusterId === cl.id;
          return (
            <motion.button
              key={cl.id}
              type="button"
              className={`hexbin-legend-pill${isActive ? ' hexbin-legend-pill--active' : ''}`}
              onMouseEnter={() => setHoveredClusterId(cl.id)}
              onMouseLeave={() => setHoveredClusterId(null)}
              onFocus={() => setHoveredClusterId(cl.id)}
              onBlur={() => setHoveredClusterId(null)}
              whileHover={shouldReduce ? undefined : { y: -1 }}
              transition={shouldReduce ? INSTANT_TRANSITION : SPRING_SNAPPY}
            >
              <span
                className="hexbin-legend-hex"
                style={{ backgroundColor: cl.color }}
                aria-hidden="true"
              />
              <span className="hexbin-legend-name">{cl.label}</span>
              <span className="hexbin-legend-meta tabular">
                {cl.count} · {formatBRLCompact(cl.total)}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
});
