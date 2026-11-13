/** Renders an automaton as an SVG state diagram (layout from layout.ts), with table and enlarged views. */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AutomatonModel } from "../engine/index.ts";
import { layoutAutomaton, R, type Direction, type Pt } from "./layout.ts";
import { TransitionTable } from "./TransitionTable.tsx";
import { useElementWidth } from "./useElementWidth.ts";

/** Props shared by the lazy and the direct diagram. */
export interface DiagramProps {
  model: AutomatonModel;
  /** accessible name, e.g. "Your DFA" */
  title: string;
  /** states to highlight (current states while tracing a string) */
  active?: ReadonlySet<number>;
  /** a state to mark as the place something went wrong */
  marked?: number | null;
  /** short text shown beside the marked state, e.g. "(2)" for the claim that names it */
  markedTag?: string;
  /** just the drawing, fitted to its box: no view switcher, no scrolling (for previews inside links) */
  bare?: boolean;
  /** the active states are a dead end (no state at all) */
  stuck?: boolean;
  /** shown faded, for an answer that changed since it was checked */
  dimmed?: boolean;
}

// a filled arrowhead with its tip at `tip`, pointing along `dir` (a unit vector)
const arrow = (tip: Pt, dir: Pt, size = 8) => {
  const px = -dir.y, py = dir.x;
  const bx = tip.x - dir.x * size, by = tip.y - dir.y * size;
  return `M${tip.x} ${tip.y}L${bx + px * size * 0.45} ${by + py * size * 0.45}L${bx - px * size * 0.45} ${by - py * size * 0.45}Z`;
};

/** A state diagram with Diagram / Table / Enlarge views. */
export function AutomatonDiagram({ model, title, active, marked = null, markedTag, stuck = false, dimmed = false, bare = false }: DiagramProps) {
  const [view, setView] = useState<"diagram" | "table">("diagram");
  const [enlarged, setEnlarged] = useState(false);
  const [box, width] = useElementWidth<HTMLDivElement>();
  // lay out both ways and keep whichever fits the frame at the larger scale (ties go left-to-right)
  const both = useMemo(() => ({ LR: layoutAutomaton(model, "LR"), TB: layoutAutomaton(model, "TB") }), [model]);
  const maxH = typeof window === "undefined" ? 720 : Math.max(360, window.innerHeight * 0.75);
  const fit = (l: { width: number; height: number }) => Math.min(1.15, (width || 640) / l.width, maxH / l.height);
  const dir: Direction = !bare && fit(both.TB) > fit(both.LR) * 1.15 ? "TB" : "LR";
  const base = both[dir];
  // room for the claim tag beside a marked state
  const layout = marked !== null && markedTag ? { ...base, y0: base.y0 - 14, width: base.width + 40, height: base.height + 14 } : base;
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialogRef.current;
    if (enlarged && d && !d.open) d.showModal();
  }, [enlarged]);

  // fit to the frame, but never shrink 13px labels below about 11px on screen: scroll instead
  const minScale = 0.85;
  const scale = width ? Math.min(1.15, Math.max(minScale, width / layout.width)) : 1;
  const scrollable = view === "diagram" && width > 0 && layout.width * scale > width + 2;
  const desc = `${model.names.length} states. Start: ${model.names[model.start]}. Accepting: ${model.names.filter((_, i) => model.accept[i]).join(", ") || "none"}.`;

  const svg = (s: number) => (
    <svg
      width={layout.width * s} height={layout.height * s}
      viewBox={`${layout.x0} ${layout.y0} ${layout.width} ${layout.height}`}
      role="img" aria-labelledby={titleId}
      className={"diagram-svg" + (dimmed ? " is-dimmed" : "")}
    >
      <title id={titleId}>{`${title}. ${desc}`}</title>
      <g className="d-edges">
        <path className="d-edge" d={layout.start.d} />
        <path className="d-head" d={arrow(layout.start.tip, layout.start.dir)} />
        {layout.edges.map((e, i) => (
          <g key={i} className={"d-edgegroup" + (active?.has(e.from) ? " from-active" : "")}>
            <path className="d-edge" d={e.d} />
            <path className="d-head" d={arrow(e.tip, e.dir)} />
          </g>
        ))}
      </g>
      <g className="d-labels">
        {layout.edges.map((e, i) => (
          <g key={i} transform={`translate(${e.labelAt.x} ${e.labelAt.y})`}>
            <rect className="d-label-bg" x={-e.labelW / 2} y={-9} width={e.labelW} height={18} rx={4} />
            <text className="d-label">{e.label}</text>
          </g>
        ))}
      </g>
      <g className="d-states">
        {layout.states.map((st) => {
          const on = !!active?.has(st.id);
          const cls = "d-state" + (on ? " is-active" : "") + (marked === st.id ? " is-marked" : "");
          return (
            <g key={st.id} className={cls} transform={`translate(${st.x} ${st.y})`}>
              {on && <circle className="d-halo" r={R + 6} />}
              <circle className="d-ring" r={R} />
              {st.accept && <circle className="d-ring d-inner" r={R - 4} />}
              <text className="d-name" style={st.name.length > 3 ? { fontSize: Math.max(11, 13 - (st.name.length - 3)) } : undefined}>{st.name}</text>
              {marked === st.id && markedTag && (
                <g className="d-tag" transform={`translate(${R + 4} ${-R - 2})`}>
                  <rect x={0} y={-10} width={markedTag.length * 8 + 8} height={18} rx={9} />
                  <text x={(markedTag.length * 8 + 8) / 2} y={-1}>{markedTag}</text>
                </g>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );

  if (bare) {
    return (
      <div ref={box} className="diagram diagram-bare">
        {svg(width ? Math.min(1.4, width / layout.width) : 1)}
      </div>
    );
  }

  return (
    <div className="diagram">
      <div className="diagram-tools" role="group" aria-label={`${title} view`}>
        <button type="button" className="tool" aria-pressed={view === "diagram"} onClick={() => setView("diagram")}>Diagram</button>
        <button type="button" className="tool" aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
        {view === "diagram" && (
          <button type="button" className="tool" onClick={() => setEnlarged(true)}>Enlarge</button>
        )}
      </div>
      {stuck && <p className="diagram-note">No state is active: the automaton is stuck, so the string is rejected.</p>}
      <div ref={box} className={"diagram-frame" + (scrollable ? " is-scrollable" : "")}
        tabIndex={scrollable ? 0 : undefined}
        aria-label={scrollable ? `${title}, scrolls sideways` : undefined}>
        {view === "diagram" ? svg(scale) : <TransitionTable model={model} caption={title} active={active} />}
      </div>
      {enlarged && (
        <dialog ref={dialogRef} className="diagram-dialog" aria-label={`${title}, enlarged`} onClose={() => setEnlarged(false)}>
          <div className="diagram-dialog-bar">
            <strong>{title}</strong>
            <button type="button" className="tool" autoFocus onClick={() => dialogRef.current?.close()}>Close</button>
          </div>
          <div className="diagram-dialog-body">{svg(Math.max(1, Math.min(1.6, (window.innerWidth - 48) / layout.width)))}</div>
        </dialog>
      )}
    </div>
  );
}
