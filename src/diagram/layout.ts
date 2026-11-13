/**
 * Positions an automaton for drawing: a model in, plain geometry out. The renderer never sees
 * the layout library (dagre), so it could be replaced in this one file.
 */
import dagre from "@dagrejs/dagre";
import type { AutomatonModel } from "../engine/index.ts";

export const R = 20; // state radius
const LOOP = 30; // how far a self-loop rises above its state
const START_LEN = 34; // length of the start arrow
const CHAR_W = 7.8; // monospace label width per character at 13px
const LABEL_H = 18; // edge label height

export interface Pt { x: number; y: number }

export interface PlacedState { id: number; name: string; x: number; y: number; accept: boolean }

export interface PlacedEdge {
  from: number;
  to: number;
  label: string;
  /** SVG path data, already clipped to the state circles */
  d: string;
  /** arrowhead tip and the direction it points */
  tip: Pt;
  dir: Pt;
  /** centre of the edge label, and its width */
  labelAt: Pt;
  labelW: number;
  /** a self-loop, drawn by hand rather than by dagre */
  self: boolean;
}

export interface Layout {
  /** top-left of the drawing (use as the viewBox origin) */
  x0: number;
  y0: number;
  width: number;
  height: number;
  states: PlacedState[];
  edges: PlacedEdge[];
  start: { d: string; tip: Pt; dir: Pt };
}

/** Left-to-right or top-to-bottom ranking. */
export type Direction = "LR" | "TB";

const labelWidth = (s: string) => Math.max(14, s.length * CHAR_W + 8);
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const unit = (v: Pt): Pt => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const onCircle = (c: Pt, toward: Pt, r = R): Pt => { const u = unit(sub(toward, c)); return { x: c.x + u.x * r, y: c.y + u.y * r }; };
const f = (n: number) => Math.round(n * 10) / 10;

/** Smooth path through points (Catmull–Rom converted to cubic Béziers). */
function smooth(pts: Pt[]): string {
  if (pts.length === 2) return `M${f(pts[0].x)} ${f(pts[0].y)}L${f(pts[1].x)} ${f(pts[1].y)}`;
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

/**
 * Lays out an automaton with dagre. The start arrow is a real edge from an invisible node, and
 * shortest-path edges are weighted so they form a straight backbone; self-loops are drawn here.
 */
export function layoutAutomaton(m: AutomatonModel, dir: Direction = "LR"): Layout {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: dir, nodesep: 28, ranksep: 56, edgesep: 14, marginx: 12, marginy: 12 });
  g.setDefaultEdgeLabel(() => ({}));

  const loops = new Set(m.edges.filter((e) => e.from === e.to).map((e) => e.from));
  const loopLabelW = new Map(m.edges.filter((e) => e.from === e.to).map((e) => [e.from, labelWidth(e.symbols.join(","))]));
  // A state with a self-loop reserves room for the loop and its label above it (LR) / beside it (TB).
  m.names.forEach((_, i) => {
    const extra = loops.has(i) ? LOOP + LABEL_H : 0;
    const w = dir === "LR" ? Math.max(2 * R, loopLabelW.get(i) ?? 0) : 2 * R + 2 * extra;
    const h = dir === "LR" ? 2 * R + 2 * extra : Math.max(2 * R, LABEL_H);
    g.setNode(String(i), { width: w, height: h });
  });
  // the start arrow is a real edge from an invisible point, so nothing is laid over it
  g.setNode("start", { width: 2, height: 2 });
  g.setEdge("start", String(m.start), { minlen: 1, weight: 4, width: 0, height: 0 }, "start");

  // Edges on shortest paths from the start form a spanning tree; weighting it keeps that
  // backbone straight and lets the remaining edges route around it.
  const depth = new Map<number, number>([[m.start, 0]]);
  const tree = new Set<number>();
  for (const q = [m.start]; q.length;) {
    const s = q.shift()!;
    m.edges.forEach((e, k) => {
      if (e.from === s && !depth.has(e.to)) { depth.set(e.to, depth.get(s)! + 1); tree.add(k); q.push(e.to); }
    });
  }
  m.edges.forEach((e, k) => {
    if (e.from === e.to) return;
    const label = e.symbols.join(",");
    g.setEdge(String(e.from), String(e.to), { width: labelWidth(label), height: LABEL_H, labelpos: "c", weight: tree.has(k) ? 4 : 1 }, "e" + k);
  });

  dagre.layout(g);

  const pos = (id: string): Pt => { const n = g.node(id); return { x: n.x!, y: n.y! }; };
  const states: PlacedState[] = m.names.map((name, i) => ({ id: i, name, ...pos(String(i)), accept: m.accept[i] }));

  const edges: PlacedEdge[] = [];
  m.edges.forEach((e, k) => {
    const label = e.symbols.join(",");
    const c = states[e.from];
    if (e.from === e.to) {
      // loop above (LR) or to the right (TB), label beyond it
      const out: Pt = dir === "LR" ? { x: 0, y: -1 } : { x: 1, y: 0 };
      const side: Pt = { x: -out.y, y: out.x };
      const spread = 0.55;
      const a = { x: c.x + R * (out.x * Math.cos(spread) - side.x * Math.sin(spread)), y: c.y + R * (out.y * Math.cos(spread) - side.y * Math.sin(spread)) };
      const b = { x: c.x + R * (out.x * Math.cos(spread) + side.x * Math.sin(spread)), y: c.y + R * (out.y * Math.cos(spread) + side.y * Math.sin(spread)) };
      const reach = R + LOOP;
      const c1 = { x: c.x + out.x * reach * 1.25 - side.x * 22, y: c.y + out.y * reach * 1.25 - side.y * 22 };
      const c2 = { x: c.x + out.x * reach * 1.25 + side.x * 22, y: c.y + out.y * reach * 1.25 + side.y * 22 };
      const lw = labelWidth(label);
      const labelAt = dir === "LR"
        ? { x: c.x, y: c.y - reach - LABEL_H / 2 + 2 }
        : { x: c.x + reach + lw / 2 - 2, y: c.y };
      edges.push({ from: e.from, to: e.to, label, self: true, labelW: lw, labelAt,
        d: `M${f(a.x)} ${f(a.y)}C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(b.x)} ${f(b.y)}`,
        tip: b, dir: unit(sub(b, c2)) });
      return;
    }
    const de = g.edge({ v: String(e.from), w: String(e.to), name: "e" + k });
    const pts = [...(de.points ?? [])];
    const to = states[e.to];
    // dagre clips to the node's box; clip to the circle instead
    pts[0] = onCircle(c, pts[1] ?? to);
    pts[pts.length - 1] = onCircle(to, pts[pts.length - 2] ?? c);
    const tip = pts[pts.length - 1];
    edges.push({ from: e.from, to: e.to, label, self: false, labelW: labelWidth(label),
      labelAt: { x: de.x!, y: de.y! }, d: smooth(pts), tip, dir: unit(sub(tip, pts[pts.length - 2])) });
  });

  const se = g.edge({ v: "start", w: String(m.start), name: "start" });
  const s0 = states[m.start];
  const sp = se.points ?? [];
  const from = sp.length ? sp[0] : { x: s0.x - START_LEN - R, y: s0.y };
  const tip = onCircle(s0, sp.length > 1 ? sp[sp.length - 2] : from);
  const back = unit(sub(from, tip));
  const tail = { x: tip.x + back.x * START_LEN, y: tip.y + back.y * START_LEN };
  const start = { d: `M${f(tail.x)} ${f(tail.y)}L${f(tip.x)} ${f(tip.y)}`, tip, dir: unit(sub(tip, tail)) };

  // dagre reserves room for loops on both sides of a state; crop to what is drawn
  const xs: number[] = [], ys: number[] = [];
  const add = (x: number, y: number) => { xs.push(x); ys.push(y); };
  for (const s of states) { add(s.x - R - 6, s.y - R - 6); add(s.x + R + 6, s.y + R + 6); }
  for (const e of edges) {
    add(e.labelAt.x - e.labelW / 2, e.labelAt.y - LABEL_H / 2); add(e.labelAt.x + e.labelW / 2, e.labelAt.y + LABEL_H / 2);
    for (const m of e.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) add(+m[1], +m[2]);
  }
  for (const m of start.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) add(+m[1], +m[2]);
  const pad = 8, x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  const width = Math.max(...xs) + pad - x0, height = Math.max(...ys) + pad - y0;
  return { x0, y0, width, height, states, edges, start };
}
