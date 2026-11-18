/**
 * The hints, as a ladder: what to remember, what each state means, the full solution (asks first),
 * and the smallest DFA. Hints open in order and stay open, so there is one action at a time. State
 * counts are never shown, since the count is itself a hint. CheckView remounts this on a new language.
 */
import { Fragment, useEffect, useId, useRef, useState, type Dispatch, type ReactNode } from "react";
import { automatonText, type Hints, type StateNote } from "../../engine/index.ts";
import type { Action, WorkbenchState } from "../../state/useWorkbench.ts";
import { Diagram, DRAW_LIMIT } from "../../diagram/LazyDiagram.tsx";
import { TransitionTable } from "../../diagram/TransitionTable.tsx";
import { StringToken } from "../../ui/StringToken.tsx";
import { TypesetRegex, TypesetSpec } from "../../ui/Typeset.tsx";
import { CopyButton } from "../../ui/CopyButton.tsx";
import { MergeTable } from "../../ui/MergeTable.tsx";
import { scrollBehavior } from "../../ui/motion.ts";
import { StateMark } from "../../ui/StateMark.tsx";

type Step = 1 | 2 | 3 | 4;

const W = <i className="math">w</i>;
const L = <i className="math">L</i>;

/** Engine prose: `backticked` strings become tokens and w is set as math. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) => (i % 2
        ? <StringToken key={i} value={part} />
        : <Fragment key={i}>{part.split(/\b(w)\b/).map((x, j) => (j % 2 ? <i key={j} className="math">w</i> : x))}</Fragment>))}
    </>
  );
}

/** Each state with what it means and a shortest string reaching it. */
function StateTable({ states }: { states: StateNote[] }) {
  return (
    <table className="ttable side-table">
      <caption className="sr-only">What each state means</caption>
      <thead>
        <tr><th scope="col">State</th><th scope="col">What is true of {W}</th><th scope="col">Shortest {W}</th></tr>
      </thead>
      <tbody>
        {states.map((s) => (
          <tr key={s.name}>
            <th scope="row" className="mono">
              {s.start && <StateMark kind="start" />}
              {s.accepting && <StateMark kind="accepting" />}
              {s.name}
            </th>
            <td>
              {s.says !== null
                ? <span className="notation"><TypesetSpec text={s.says} /></span>
                : s.sink === "dead" ? <>no extension of {W} is in {L}</> : <>every extension of {W} is in {L}</>}
            </td>
            <td><StringToken value={s.example} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A diagram, or its table past DRAW_LIMIT. */
function Drawing({ hints, which }: { hints: Hints; which: "dfa" | "smallest" }) {
  const model = hints[which];
  const title = which === "dfa" ? "A DFA for this language" : "The smallest DFA for this language";
  return model.names.length <= DRAW_LIMIT
    ? <Diagram model={model} title={title} />
    : <><p className="help">This one is too large to draw clearly, so here is its transition table.</p><TransitionTable model={model} caption={title} /></>;
}

export function StuckSection({ state, hints, dispatch }: { state: WorkbenchState; hints: Hints | null; dispatch: Dispatch<Action> }) {
  const headingId = useId();
  const [confirming, setConfirming] = useState(false);
  const titles = useRef<Partial<Record<Step, HTMLHeadingElement | null>>>({});
  const moved = useRef<Step | null>(null);
  // a hint that just opened (or the solution that just closed) takes focus and scrolls into view
  useEffect(() => {
    const step = moved.current;
    if (step === null) return;
    moved.current = null;
    const el = titles.current[step];
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "start", behavior: scrollBehavior() });
  }, [state.hintsOpened]);
  if (!hints) return null;

  const opened = state.hintsOpened;
  const open = (step: Step) => { moved.current = step; dispatch({ type: "openHint", step }); };
  const hide = () => { moved.current = 3; setConfirming(false); dispatch({ type: "hideSolution" }); };
  const smaller = hints.smallest.names.length < hints.dfa.names.length;
  const hasDead = hints.states.some((s) => s.sink === "dead"), hasAll = hints.states.some((s) => s.sink === "all");

  const rungs: { step: Step; title: string; promise: string; body: () => ReactNode }[] = [
    {
      step: 1, title: "What to remember",
      promise: "What a DFA for this language has to keep track of while it reads a string.",
      body: () => (
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
          ) : <p className="out-caption">Nothing at all: every string gets the same answer.</p>}
          {(hints.remember.length > 1 || hasDead || hasAll) && (
            <p className="out-caption">
              {hints.remember.length > 1 && "Each state is one combination of these. "}
              {hasDead && <>The combinations from which {W} can never get into {L} all become one dead state. </>}
              {hasAll && <>The combinations after which every extension of {W} is in {L} all become one accepting state.</>}
            </p>
          )}
        </>
      ),
    },
    {
      step: 2, title: "What each state means",
      promise: "The states of such a DFA, each described by what is true of the strings that lead to it.",
      body: () => (
        <>
          <p className="out-caption">
            Each state stands for the strings that lead to it, and is described by what is true of them.{" "}
            <StateMark kind="start" /> marks the start state and <StateMark kind="accepting" /> the accepting ones.
          </p>
          <div className="states-wide"><StateTable states={hints.states} /></div>
          <p className="out-caption">To finish the DFA, work out the moves: from each state, after one more symbol, which description is true?</p>
        </>
      ),
    },
    {
      step: 3, title: "The full solution",
      promise: "A complete DFA for the language, and a regular expression.",
      body: () => (
        <>
          <p className="out-caption">Each move goes to the state whose description is true after one more symbol.</p>
          <div className="rung-figure"><Drawing hints={hints} which="dfa" /></div>
          <h4 className="h-sub">A regular expression</h4>
          <p className="solution-regex math"><TypesetRegex text={hints.regex} /></p>
          <p className="help">
            {hints.regex.length > 80
              ? "Built from the smallest DFA, so it can be long. A shorter one usually exists; yours only has to describe the same language."
              : "One of many correct answers. Yours only has to describe the same language."}
          </p>
          <div className="actions">
            <CopyButton text={automatonText(hints.dfa)} label="Copy the DFA as text" />
            <CopyButton text={hints.regex} label="Copy the regex as text" />
            <button type="button" className="btn-quiet" onClick={hide}>Hide the solution</button>
          </div>
        </>
      ),
    },
    // either the smaller DFA merging gives, or a note that the solution is already the smallest
    {
      step: 4, title: "The smallest DFA",
      promise: "Whether any states of the solution can be merged into a smaller DFA.",
      body: () => (!smaller ? (
        <p className="out-caption">
          The smallest DFA is the same as the one in the full solution. Any two of its states can be told apart by some string,
          so none of them can be merged.
        </p>
      ) : (
        <>
          <p className="out-caption">
            Some states of the solution can't be told apart by any string. From each group of merged states, exactly the same strings lead to acceptance, so one state can do the work of the
            whole group. The smallest DFA accepts the same language, but its states no longer say as much.
          </p>
          <div className="figure has-aside rung-figure">
            <div><Drawing hints={hints} which="smallest" /></div>
            <MergeTable names={hints.smallest.names} merged={hints.merged} caption="Which states of the DFA above each one merges" />
          </div>
          <div className="actions"><CopyButton text={automatonText(hints.smallest)} label="Copy as text" /></div>
        </>
      )),
    },
  ];

  return (
    <section id="stuck" className="stuck" aria-labelledby={headingId}>
      <div className="out">
        <h2 id={headingId} className="h-section" tabIndex={-1}>Stuck?</h2>
        <p className="out-caption">Each hint gives away a little more. Open them only as far as you need.</p>
        <ol className="ladder" aria-label="Hints, in order">
          {rungs.map((r) => {
            const isOpen = r.step <= opened, isNext = r.step === opened + 1;
            return (
              <li key={r.step} className={"rung" + (!isOpen && !isNext ? " is-later" : "")}>
                <h3 ref={(el) => { titles.current[r.step] = el; }} tabIndex={-1} className="rung-title">{r.title}</h3>
                {isOpen ? <div className="rung-body">{r.body()}</div> : (
                  <>
                    <p className="rung-promise">{r.promise}{!isNext && <span className="sr-only"> Opens after the hint above.</span>}</p>
                    {isNext && r.step !== 3 && (
                      <button type="button" className="btn-quiet" onClick={() => open(r.step)}>{r.step === 4 ? "Show the smallest DFA" : "Show this hint"}</button>
                    )}
                    {isNext && r.step === 3 && !confirming && (
                      <button type="button" className="btn-quiet btn-warn" onClick={() => setConfirming(true)}>Show the full solution…</button>
                    )}
                    {isNext && r.step === 3 && confirming && (
                      <div className="confirm" role="group" aria-label="Confirm showing the solution">
                        <p><strong>This shows a complete answer.</strong> Once you have seen it, this example stops being practice.</p>
                        <div className="hint-actions">
                          <button type="button" className="btn-quiet btn-warn" onClick={() => { setConfirming(false); open(3); }}>Show the solution</button>
                          <button type="button" className="btn-quiet" autoFocus onClick={() => setConfirming(false)}>Keep trying</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
