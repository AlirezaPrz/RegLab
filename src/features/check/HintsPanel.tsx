/** Progressive hints and the gated full solution for the current language. */
import { useState, type Dispatch } from "react";
import type { Hints } from "../../engine/index.ts";
import type { Action, WorkbenchState } from "../../state/useWorkbench.ts";
import { StringToken } from "../../ui/StringToken.tsx";
import { TypesetRegex } from "../../ui/Typeset.tsx";
import { plural } from "../../ui/text.ts";
import { Diagram } from "../../diagram/LazyDiagram.tsx";

/**
 * Hints open one step at a time. The full solution needs two separate actions, so it is never
 * revealed by accident, and it closes whenever the language changes (the reducer resets it).
 * `confirming` is local: CheckView remounts this panel when the language changes.
 */
export function HintsPanel({ state, hints, dispatch }: { state: WorkbenchState; hints: Hints | null; dispatch: Dispatch<Action> }) {
  const [confirming, setConfirming] = useState(false);
  if (!hints) return null;

  return (
    <section className="hints" aria-labelledby="hints-heading">
      <h3 id="hints-heading" className="h-sub">Stuck?</h3>
      <p className="help">Each hint gives away a little more. Open them only as far as you need.</p>

      {state.hintLevel >= 1 && (
        <p className="hint">The smallest DFA for this language has <strong>{plural(hints.minStates, "state")}</strong>.</p>
      )}
      {state.hintLevel >= 2 && (
        <p className="hint">
          Each state has to remember something different. One shortest string that leads to each state:{" "}
          {hints.classes.slice(0, -1).map((c, i) => <StringToken key={i} value={c.rep} />)}
          <span className="nowrap"><StringToken value={hints.classes[hints.classes.length - 1].rep} />.</span>{" "}
          No two of these may end in the same state, because some continuation tells them apart.
        </p>
      )}

      <div className="hint-actions">
        {state.hintLevel === 0 && <button type="button" className="btn-quiet" onClick={() => dispatch({ type: "hint", level: 1 })}>Hint 1: how many states?</button>}
        {state.hintLevel === 1 && <button type="button" className="btn-quiet" onClick={() => dispatch({ type: "hint", level: 2 })}>Hint 2: what each state remembers</button>}
        {state.hintLevel === 2 && !state.solutionShown && !confirming && (
          <button type="button" className="btn-quiet btn-warn" onClick={() => setConfirming(true)}>Show the full solution…</button>
        )}
      </div>

      {confirming && !state.solutionShown && (
        <div className="confirm" role="group" aria-labelledby="confirm-text">
          <p id="confirm-text"><strong>This shows a complete answer.</strong> You won't be able to work it out yourself afterwards. Show it?</p>
          <div className="hint-actions">
            <button type="button" className="btn-quiet btn-warn" onClick={() => {
              dispatch({ type: "solution", shown: true }); setConfirming(false);
              requestAnimationFrame(() => document.getElementById("solution")?.focus());
            }}>Yes, show the solution</button>
            <button type="button" className="btn-quiet" autoFocus onClick={() => setConfirming(false)}>Not yet</button>
          </div>
        </div>
      )}

      {state.solutionShown && (
        <div className="hint-actions">
          <button type="button" className="btn-quiet" onClick={() => { const el = document.getElementById("solution"); el?.scrollIntoView({ block: "start" }); el?.focus({ preventScroll: true }); }}>Go to the solution</button>
          <button type="button" className="btn-quiet" onClick={() => dispatch({ type: "solution", shown: false })}>Hide solution</button>
        </div>
      )}
    </section>
  );
}

/** The revealed solution, given the full width so larger DFAs stay legible. */
export function SolutionPanel({ hints, dispatch }: { hints: Hints; dispatch: Dispatch<Action> }) {
  return (
    <section id="solution" className="solution" aria-labelledby="solution-heading" tabIndex={-1}>
      <div className="solution-head">
        <h2 id="solution-heading" className="h-section">Full solution</h2>
        <button type="button" className="btn-quiet" onClick={() => dispatch({ type: "solution", shown: false })}>Hide solution</button>
      </div>
      <div className="solution-grid">
        <div className="solution-part">
          <h3 className="h-sub">A regular expression</h3>
          <p className="solution-regex math"><TypesetRegex text={hints.regex} /></p>
          <p className="help">
            {hints.regex.length > 80
              ? "Built from the smallest DFA, so it can be long. A shorter one usually exists; yours only has to describe the same language."
              : "One of many correct answers. Yours only has to describe the same language."}
          </p>
        </div>
        <div className="solution-part">
          <h3 className="h-sub">A smallest DFA <span className="muted">({plural(hints.minStates, "state")})</span></h3>
          <Diagram model={hints.solution} title="A smallest DFA for the language" />
        </div>
      </div>
    </section>
  );
}
