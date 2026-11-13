/** The table view of an automaton, the accessible alternative to the diagram. */
import type { AutomatonModel } from "../engine/index.ts";

/** Rows are states (→ marks the start, ✱ the accepting states), columns are symbols with ε last. */
export function TransitionTable({ model, caption, active }: { model: AutomatonModel; caption: string; active?: ReadonlySet<number> }) {
  const symbols: string[] = [];
  for (const e of model.edges) for (const s of e.symbols) if (!symbols.includes(s)) symbols.push(s);
  symbols.sort((a, b) => (a === "ε" ? 1 : b === "ε" ? -1 : a.localeCompare(b)));
  const cell = (from: number, sym: string) =>
    model.edges.filter((e) => e.from === from && e.symbols.includes(sym)).map((e) => model.names[e.to]).join(", ");
  return (
    <table className="ttable">
      <caption className="sr-only">{caption}: transition table</caption>
      <thead>
        <tr><th scope="col">State</th>{symbols.map((s) => <th key={s} scope="col" className="mono">{s}</th>)}</tr>
      </thead>
      <tbody>
        {model.names.map((name, i) => (
          <tr key={i} className={active?.has(i) ? "is-active" : undefined}>
            <th scope="row" className="mono">
              {i === model.start && <span className="tt-mark" aria-label="start">→</span>}
              {model.accept[i] && <span className="tt-mark" aria-label="accepting">✱</span>}
              {name}
            </th>
            {symbols.map((s) => <td key={s} className="mono">{cell(i, s) || <span className="tt-none" aria-label="no move">·</span>}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
