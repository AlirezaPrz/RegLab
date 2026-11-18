/**
 * The hints, as steps that open in order: what a DFA for the language has to remember, its states
 * and what each means, the DFA itself (the full solution, which asks first), and the smallest DFA.
 * The steps reset whenever the language changes (the reducer does it).
 */
import { Fragment, useId, useRef, type Dispatch, type ReactNode } from "react";
import { automatonText, type Hints, type StateNote } from "../../engine/index.ts";
import type { Action, HintStep, WorkbenchState } from "../../state/useWorkbench.ts";
import { Diagram, DRAW_LIMIT } from "../../diagram/LazyDiagram.tsx";
import { TransitionTable } from "../../diagram/TransitionTable.tsx";
import { StringToken } from "../../ui/StringToken.tsx";
import { TypesetRegex, TypesetSpec } from "../../ui/Typeset.tsx";
import { CopyButton } from "../../ui/CopyButton.tsx";
import { MergeTable } from "../../ui/MergeTable.tsx";
import { plural } from "../../ui/text.ts";

const STEPS: { step: 1 | 2 | 3 | 4; name: string }[] = [
  { step: 1, name: "What to remember" },
  { step: 2, name: "The states" },
  { step: 3, name: "The DFA" },
  { step: 4, name: "Smallest DFA" },
];

/** Engine prose: strings over the alphabet come in `backticks`, and w is set as math. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) => (i % 2
        ? <StringToken key={i} value={part} />
        : <Fragment key={i}>{part.split(/\b(w)\b/).map((x, j) => (j % 2 ? <i key={j} className="math">w</i> : x))}</Fragment>))}
    </>
  );
}

const W = <i className="math">w</i>;
const L = <i className="math">L</i>;

/** The states with what each means; `examples` adds a shortest string that leads to each. */
function StateTable({ states, caption, examples = false }: { states: StateNote[]; caption: string; examples?: boolean }) {
  return (
    <table className="ttable side-table">
      <caption>{caption}</caption>
      <thead>
        <tr><th scope="col">State</th><th scope="col">What is true of {W}</th>{examples && <th scope="col">Shortest {W}</th>}</tr>
      </thead>
      <tbody>
        {states.map((s) => (
          <tr key={s.name}>
            <th scope="row" className="mono">
              {s.start && <span className="tt-mark" aria-label="start">→</span>}
              {s.accepting && <span className="tt-mark" aria-label="accepting">✱</span>}
              {s.name}
            </th>
            <td>
              {s.says !== null
                ? <span className="notation"><TypesetSpec text={s.says} /></span>
                : s.sink === "dead" ? <>no extension of {W} is in {L}</> : <>every extension of {W} is in {L}</>}
            </td>
            {examples && <td><StringToken value={s.example} /></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StuckSection({ state, hints, dispatch }: { state: WorkbenchState; hints: Hints | null; dispatch: Dispatch<Action> }) {
  const ids = { h: useId(), tabs: useId(), confirm: useId() };
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  if (!hints) return null;

  const opened = state.hintsOpened, shown = state.hintShown;
  const open = (step: 1 | 2 | 3 | 4) => dispatch({ type: "showHint", step });
  const hide = () => dispatch({ type: "hideSolution" });
  const usable = (step: HintStep) => step <= opened + 1;
  const n = hints.dfa.names.length, m = hints.smallest.names.length;
  const sub = (step: 1 | 2 | 3 | 4) => (step === 1 ? "Hint 1"
    : step === 2 ? (opened >= 2 ? plural(n, "state") : "Hint 2")
    : step === 3 ? "Full solution"
    : opened >= 4 ? plural(m, "state") : "After the solution");
  // arrow keys only move between steps; opening one takes Enter or a click, so no hint opens by accident
  const moveFocus = (from: number, by: number) => {
    for (let i = from + by; i >= 0 && i < STEPS.length; i += by) if (usable(STEPS[i].step)) { tabRefs.current[i]?.focus(); return; }
  };
  const hasDead = hints.states.some((s) => s.sink === "dead"), hasAll = hints.states.some((s) => s.sink === "all");

  const panels: Record<1 | 2 | 3 | 4, () => ReactNode> = {
    1: () => (
      <>
        <p className="out-caption">A DFA reads {W} one symbol at a time. To decide whether {W} is in {L}, all it has to remember is:</p>
        {hints.remember.length ? (
          <ul className="remember">
            {hints.remember.map((r, i) => (
              <li key={i}>
                {r.what ? <><span className="notation"><TypesetSpec text={r.what} /></span>: <Prose text={r.text} /></>
                  : <Prose text={r.text[0].toUpperCase() + r.text.slice(1)} />}
              </li>
            ))}
          </ul>
        ) : <p className="remember">Nothing: every string gets the same answer.</p>}
        {(hints.remember.length > 1 || hasDead || hasAll) && (
          <p className="out-caption">
            {hints.remember.length > 1 && "Each state is one combination of these. "}
            {hasDead && <>The combinations from which {W} can never get into {L} all become one dead state. </>}
            {hasAll && <>The combinations after which every extension of {W} is in {L} all become one accepting state.</>}
          </p>
        )}
        <div className="actions"><button type="button" className="btn-quiet" onClick={() => open(2)}>Next hint: the states</button></div>
      </>
    ),
    2: () => (
      <>
        <p className="out-caption">
          That makes {plural(n, "state")}. Each state stands for the strings that lead to it, and is described by what is true of
          them. → marks the start state and ✱ the accepting ones.
        </p>
        <div className="states-wide"><StateTable states={hints.states} caption="The states" examples /></div>
        <p className="out-caption">To finish the DFA, work out the moves: from each state, after one more symbol, which description is true?</p>
        <div className="actions"><button type="button" className="btn-quiet btn-warn" onClick={() => open(3)}>Show the full solution…</button></div>
      </>
    ),
    3: () => (opened < 3 ? (
      <div className="confirm" role="group" aria-labelledby={ids.confirm}>
        <p id={ids.confirm}><strong>This shows a complete answer.</strong> You won't be able to work it out yourself afterwards. Show it?</p>
        <div className="hint-actions">
          <button type="button" className="btn-quiet btn-warn" onClick={() => dispatch({ type: "confirmSolution" })}>Yes, show the solution</button>
          <button type="button" className="btn-quiet" autoFocus onClick={hide}>Not yet</button>
        </div>
      </div>
    ) : (
      <>
        <p className="out-caption">The full DFA. Each move goes to the state whose description is true after one more symbol.</p>
        <div className="figure has-aside">
          <div>
            {n <= DRAW_LIMIT
              ? <Diagram model={hints.dfa} title="The DFA for this language" />
              : <><p className="help">With {plural(n, "state")} this is too large to draw clearly, so here is its transition table.</p><TransitionTable model={hints.dfa} caption="The DFA" /></>}
          </div>
          <StateTable states={hints.states} caption="What each state means" />
        </div>
        <div className="hint-regex">
          <h3 className="h-sub">A regular expression</h3>
          <p className="solution-regex math"><TypesetRegex text={hints.regex} /></p>
          <p className="help">
            {hints.regex.length > 80
              ? "Built from the smallest DFA, so it can be long. A shorter one usually exists; yours only has to describe the same language."
              : "One of many correct answers. Yours only has to describe the same language."}
          </p>
        </div>
        <div className="actions">
          <CopyButton text={automatonText(hints.dfa)} label="Copy the DFA as text" />
          <button type="button" className="btn-quiet" onClick={() => open(4)}>Next: the smallest DFA</button>
          <button type="button" className="btn-quiet" onClick={hide}>Hide the solution</button>
        </div>
      </>
    )),
    4: () => (
      <>
        {m < n ? (
          <>
            <p className="out-caption">
              Some of these states can't be told apart by any string: from each of them, exactly the same strings lead to acceptance.
              Merging them gives the smallest DFA, with {plural(m, "state")}. It accepts the same language, but its states no longer say as much.
            </p>
            <div className="figure has-aside">
              <div>
                {m <= DRAW_LIMIT ? <Diagram model={hints.smallest} title="The smallest DFA for this language" /> : <TransitionTable model={hints.smallest} caption="The smallest DFA" />}
              </div>
              <MergeTable names={hints.smallest.names} merged={hints.merged} caption="Which states of the DFA each one merges" />
            </div>
          </>
        ) : (
          <p className="out-caption">Every two states can be told apart by some string, so nothing can be merged: the DFA in the solution is already the smallest, and no DFA for this language has fewer than {plural(m, "state")}.</p>
        )}
        <div className="actions">
          {m < n && <CopyButton text={automatonText(hints.smallest)} label="Copy as text" />}
          <button type="button" className="btn-quiet" onClick={hide}>Hide the solution</button>
        </div>
      </>
    ),
  };

  return (
    <section className="stuck" aria-labelledby={ids.h}>
      <div className="out">
        <h2 id={ids.h} className="h-section">Stuck?</h2>
        <p className="out-caption">Each step gives away more of the answer. Open them only as far as you need.</p>
        <div className="pipeline" role="tablist" aria-label="Hints, in order">
          {STEPS.map((s, i) => (
            <Fragment key={s.step}>
              {i > 0 && <span className="pipeline-arrow" aria-hidden="true">→</span>}
              <button ref={(el) => { tabRefs.current[i] = el; }} type="button" role="tab" id={`${ids.tabs}-${s.step}`}
                aria-selected={shown === s.step} aria-controls={shown ? `${ids.tabs}-panel` : undefined}
                aria-disabled={!usable(s.step) || undefined}
                tabIndex={shown === s.step || (shown === 0 && s.step === 1) ? 0 : -1}
                className="pipeline-step"
                onClick={() => { if (usable(s.step)) open(s.step); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") { e.preventDefault(); moveFocus(i, 1); }
                  if (e.key === "ArrowLeft") { e.preventDefault(); moveFocus(i, -1); }
                }}>
                <span className="pipeline-name">{s.name}</span>
                <span className="pipeline-count">{sub(s.step)}</span>
              </button>
            </Fragment>
          ))}
        </div>
        {shown === 0 ? (
          <>
            <p className="out-empty">Start with hint 1: what a DFA for this language has to keep track of.</p>
            <div className="actions"><button type="button" className="btn-quiet" onClick={() => open(1)}>Show hint 1</button></div>
          </>
        ) : (
          <div role="tabpanel" id={`${ids.tabs}-panel`} aria-labelledby={`${ids.tabs}-${shown}`} className="out-panel">
            {panels[shown]()}
          </div>
        )}
      </div>
    </section>
  );
}
