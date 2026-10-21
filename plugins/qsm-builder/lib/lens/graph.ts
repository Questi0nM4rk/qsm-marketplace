// Inline SVG graphs, laid out by plain code: one column per layer, rows in order, edges as curves.
// The same input gives the same SVG byte for byte; there is no layout library.

export interface Vertex {
  readonly id: string;
  readonly label: string;
  /** `hl` the subject, `node` a plugin, `part` a skill, agent, hooks or CLI of one, `tool` a CLI tool, `web` a web source, `mcp` an MCP server */
  readonly cls: "hl" | "node" | "part" | "tool" | "web" | "mcp";
  readonly layer: number;
  /** where the node leads, a hash route or a path: the next level down */
  readonly href?: string;
}

export interface Link {
  readonly from: string;
  readonly to: string;
  /** a declared dependency, drawn heavier than a mention */
  readonly dep: boolean;
  /** to a name outside the marketplace: the page may hide it */
  readonly out?: boolean;
  /** a plugin to one of its own parts: a plain line, since neither uses the other */
  readonly own?: boolean;
}

const NH = 32;
const ROW_GAP = 14;
const COL_GAP = 90;
const PAD = 10;
const CHAR = 8;

export const esc = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const clip = (s: string): string => (s.length > 28 ? `${s.slice(0, 27)}…` : s);

/** The mean row of a node's neighbours in `col`, or `null` when it has none there. */
function meanRow(n: Vertex, col: readonly Vertex[], edges: readonly Link[]): number | null {
  const near = new Set(
    edges.flatMap((e) => [e.from === n.id ? e.to : "", e.to === n.id ? e.from : ""]),
  );
  const at = col.map((b, i) => (near.has(b.id) ? i : -1)).filter((i) => i >= 0);
  return at.length === 0 ? null : at.reduce((a, b) => a + b, 0) / at.length;
}

/** `col` sorted by the mean row of each node's neighbours in `by`; a node with none goes last. */
function sortBy(col: readonly Vertex[], by: readonly Vertex[], edges: readonly Link[]): Vertex[] {
  return col
    .map((n, i) => ({ n, i, k: meanRow(n, by, edges) ?? Number.POSITIVE_INFINITY }))
    .toSorted((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.n);
}

/**
 * Rows of each layer ordered by the mean row of their neighbours in the layer before, then the
 * first layer once more by the layer after it, so fewer curves cross and a node with no edge
 * sinks to the bottom of its column.
 */
function order(nodes: readonly Vertex[], edges: readonly Link[]): Vertex[][] {
  const top = Math.max(...nodes.map((n) => n.layer));
  const cols: Vertex[][] = [];
  for (let layer = 0; layer <= top; layer += 1) {
    const col = nodes.filter((n) => n.layer === layer);
    cols.push(layer === 0 ? col : sortBy(col, cols[layer - 1] ?? [], edges));
  }
  const [first, second] = cols;
  if (first !== undefined && second !== undefined && first.length > 1) {
    cols[0] = sortBy(first, second, edges);
  }
  return cols;
}

interface Placed extends Vertex {
  readonly x: number;
  readonly y: number;
  readonly w: number;
}

/** One column as drawn: its left edge, its width, and the y of the gap above each row and below the last. */
interface Column {
  readonly x: number;
  readonly w: number;
  readonly gaps: readonly number[];
}

function place(cols: readonly (readonly Vertex[])[]): {
  placed: Map<string, Placed>;
  columns: Column[];
  width: number;
  height: number;
} {
  const heights = cols.map((c) => c.length * NH + Math.max(0, c.length - 1) * ROW_GAP);
  const height = Math.max(...heights) + 2 * PAD;
  const placed = new Map<string, Placed>();
  const columns: Column[] = [];
  let x = PAD;
  cols.forEach((col, i) => {
    const w = Math.max(90, ...col.map((n) => clip(n.label).length * CHAR + 24));
    const top = PAD + (height - 2 * PAD - (heights[i] ?? 0)) / 2;
    col.forEach((n, row) => {
      placed.set(n.id, { ...n, x, y: top + row * (NH + ROW_GAP), w });
    });
    const gaps = Array.from({ length: col.length + 1 }, (_, k) =>
      col.length === 0 ? height / 2 : top + k * (NH + ROW_GAP) - ROW_GAP / 2,
    );
    columns.push({ x, w, gaps });
    x += w + COL_GAP;
  });
  return { placed, columns, width: x - COL_GAP + PAD, height };
}

/**
 * The points an edge passes: out of one box, through the gap between two rows of every column it
 * skips (the gap nearest the straight line), into the other box. A curve never runs under a box.
 */
function waypoints(a: Placed, b: Placed, columns: readonly Column[]): [number, number][] {
  const forward = a.x < b.x;
  const start: [number, number] = [forward ? a.x + a.w : a.x, a.y + NH / 2];
  const end: [number, number] = [forward ? b.x : b.x + b.w, b.y + NH / 2];
  const between = columns.filter((c) =>
    forward ? c.x > a.x && c.x < b.x : c.x < a.x && c.x > b.x,
  );
  const lanes = (forward ? between : between.toReversed()).flatMap((c): [number, number][] => {
    const t = (c.x + c.w / 2 - start[0]) / (end[0] - start[0]);
    const want = start[1] + t * (end[1] - start[1]);
    const y = c.gaps.reduce((best, g) => (Math.abs(g - want) < Math.abs(best - want) ? g : best));
    return forward
      ? [
          [c.x, y],
          [c.x + c.w, y],
        ]
      : [
          [c.x + c.w, y],
          [c.x, y],
        ];
  });
  return [start, ...lanes, end];
}

/** A path through the points: a level line across a column, an S-curve between columns. */
function pathOf(points: readonly [number, number][]): string {
  const [first, ...rest] = points;
  if (first === undefined) {
    return "";
  }
  let prev = first;
  const parts = [`M${first[0]} ${first[1]}`];
  rest.forEach((p, i) => {
    const curve = i % 2 === 0;
    const mid = (prev[0] + p[0]) / 2;
    parts.push(curve ? `C${mid} ${prev[1]} ${mid} ${p[1]} ${p[0]} ${p[1]}` : `L${p[0]} ${p[1]}`);
    prev = p;
  });
  return parts.join(" ");
}

/** One SVG. `title` is the accessible name. */
export function graph(
  title: string,
  uid: string,
  nodes: readonly Vertex[],
  edges: readonly Link[],
): string {
  if (nodes.length === 0) {
    return "";
  }
  const { placed, columns, width, height } = place(order(nodes, edges));
  const marker = `ah-${uid}`;
  const paths = edges.flatMap((e) => {
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (a === undefined || b === undefined) {
      return [];
    }
    const d = pathOf(waypoints(a, b, columns));
    return [
      `<path class="arr${e.dep ? " dep" : ""}${e.own === true ? " own" : ""}" data-from="${esc(e.from)}" data-to="${esc(e.to)}"${e.out === true ? " data-out" : ""} d="${d}"${e.own === true ? "" : ` marker-start="url(#${marker})"`}/>`,
    ];
  });
  const boxes = [...placed.values()].map((n) => {
    const box = `<g data-id="${esc(n.id)}"><rect class="${n.cls}" x="${n.x}" y="${n.y}" width="${n.w}" height="${NH}"/><text${n.cls === "hl" ? ' class="on-hl"' : ""} x="${n.x + n.w / 2}" y="${n.y + 21}" text-anchor="middle">${esc(clip(n.label))}</text></g>`;
    return n.href === undefined ? box : `<a href="${esc(n.href)}">${box}</a>`;
  });
  // Drawn at its own size, never larger, and never below 85% of it (13px text stays 11px or more);
  // a narrower page scrolls the figure sideways. A figure with no link has no focusable child, so
  // the scroller itself takes focus and the keyboard can scroll it.
  const linked = nodes.some((n) => n.href !== undefined);
  const svg = `<svg viewBox="0 0 ${width} ${height}" style="min-width:${Math.round(width * 0.85)}px;max-width:${width}px" role="${linked ? "group" : "img"}" aria-label="${esc(title)}"><defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ah" d="M0 0L10 5L0 10z"/></marker></defs>${paths.join("")}${boxes.join("")}</svg>`;
  return `<div class="fwrap"${linked ? "" : ` tabindex="0" role="region" aria-label="${esc(title)}"`}>${svg}</div>`;
}
