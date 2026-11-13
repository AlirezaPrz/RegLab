/** The verdict on a checked answer, written as a short proof: the claim, numbered evidence, then notes. */
import type { ReactNode } from "react";
import type { Answer, Feedback } from "../../engine/index.ts";
import type { Derived } from "../../state/useWorkbench.ts";
import { Icon } from "../../ui/Icon.tsx";
import { StringToken } from "../../ui/StringToken.tsx";
import { plural } from "../../ui/text.ts";
import { show } from "../../engine/index.ts";

const KIND: Record<Exclude<Feedback["verdict"], "correct">, string> = {
  "both": "It accepts some strings it should not, and misses some it should accept.",
  "too-generous": "It is too generous: everything in the language is accepted, but so are some strings outside it.",
  "too-strict": "It is too strict: everything it accepts is right, but it misses some strings.",
};

/** The confused-strings claim comes after the wrongly accepted and wrongly rejected strings. */
export const conflationClaimNumber = (fb: Feedback) => (fb.extra !== null ? 1 : 0) + (fb.missing !== null ? 1 : 0) + 1;

// a state name in running text
const St = ({ children }: { children: ReactNode }) => <code className="state-name">{children}</code>;
const stateLabel = (name: string | null) => (name === null ? <>the implied dead state</> : <St>{name}</St>);
const list = (items: ReactNode[]) => items.map((x, i) => <span key={i}>{i > 0 && (i === items.length - 1 ? " and " : ", ")}{x}</span>);

/** The verdict panel, including its empty and unreadable-answer states. */
export function FeedbackPanel({ derived, onTry }: { derived: Derived; onTry: (w: string) => void }) {
  const r = derived.result;
  if (!r) {
    return (
      <div className="verdict verdict-empty">
        <p className="muted">Write an answer and press <strong>Check my answer</strong>. You'll see whether it is right and, if not, the shortest strings it gets wrong.</p>
      </div>
    );
  }
  if (!r.ok) {
    return (
      <div className="verdict verdict-empty">
        <p className="muted">{derived.stale ? "Check again to see feedback for your edited answer." : "Your answer couldn't be read. The problem is marked under your answer."}</p>
      </div>
    );
  }
  return <Verdict answer={r.answer} fb={r.feedback} stale={derived.stale} onTry={onTry} />;
}

/** The verdict on a readable answer. Without onTry its strings are plain text (for the landing page walkthrough). */
export function Verdict({ answer, fb, stale, onTry }: { answer: Answer; fb: Feedback; stale: boolean; onTry?: (w: string) => void }) {
  const M = answer.kind === "regex" ? "r" : "M";
  const what = answer.kind === "regex" ? "regular expression" : answer.kind === "nfa" ? "NFA" : "DFA";
  const t = (w: string) => <StringToken value={w} onTry={onTry} />;

  const m = (w: string) => <span className="m-str">{show(w)}</span>;
  const LM = <><i>L</i>(<i>{M}</i>)</>;
  const formal = (x: ReactNode) => <span className="formal math" aria-hidden="true">{x}</span>;
  const claims: ReactNode[] = [];
  if (fb.extra !== null) claims.push(<>It accepts {t(fb.extra)}, which is <strong>not</strong> in the language.
    {formal(<>{m(fb.extra)} <span className="m-op">∈</span> {LM}, but {m(fb.extra)} <span className="m-op">∉</span> <i>L</i></>)}</>);
  if (fb.missing !== null) claims.push(<>It rejects {t(fb.missing)}, which <strong>is</strong> in the language.
    {formal(<>{m(fb.missing)} <span className="m-op">∉</span> {LM}, but {m(fb.missing)} <span className="m-op">∈</span> <i>L</i></>)}</>);
  if (fb.conflated) {
    const c = fb.conflated;
    const side = (inL: boolean) => (inL ? "is in the language" : "is not");
    claims.push(
      <>
        Where the DFA loses information: {t(c.u)} and {t(c.v)} both lead to {stateLabel(c.stateName)}, so your DFA treats them the same from then on.
        But they must be told apart: {c.z !== "" && <>after reading {t(c.z)} next, </>}{t(c.u + c.z)} {side(c.uIn)} while {t(c.v + c.z)} {side(c.vIn)}.
        {formal(<><i>δ</i><sup>∗</sup>({m(c.u)}) <span className="m-op">=</span> <i>δ</i><sup>∗</sup>({m(c.v)}){c.stateName !== null && <> <span className="m-op">=</span> {c.stateName}</>}, but {m(c.u + c.z)} <span className="m-op">{c.uIn ? "∈" : "∉"}</span> <i>L</i> and {m(c.v + c.z)} <span className="m-op">{c.vIn ? "∈" : "∉"}</span> <i>L</i></>)}
      </>,
    );
  }

  const notes: ReactNode[] = [];
  if (fb.nfa) notes.push(<>Your automaton is nondeterministic, so it was checked as an NFA.</>);
  if (fb.missingMoves.length) {
    const shown = fb.missingMoves.slice(0, 4).map(([s, c]) => <><St>{s}</St> on <code>{c}</code></>);
    const more = fb.missingMoves.length - shown.length;
    notes.push(<>A DFA needs a move for every symbol in every state. Missing: {list(shown)}{more > 0 && <>, and {more} more</>}. These were treated as rejecting.</>);
  }
  if (fb.states) {
    const s = fb.states;
    const count = s.impliedDead
      ? <>{plural(s.written, "state")} plus an implied dead state for the missing moves ({s.total} in all)</>
      : <>{plural(s.total, "state")}</>;
    if (s.total <= s.min) notes.push(<>It uses {count}, which is the fewest possible.</>);
    else notes.push(
      <>
        It uses {count}; the smallest possible is {s.min}.
        {s.mergeable.length > 0 && <> These states behave identically and could be merged: {s.mergeable.map((g, i) => <span key={i}>{i > 0 && "; "}{list(g.map(stateLabel))}</span>)}.</>}
        {s.unreachable.length > 0 && <> Never reached from the start: {list(s.unreachable.map((n) => <St>{n}</St>))}.</>}
      </>,
    );
  }

  const tone = fb.correct ? "good" : "bad";
  return (
    <div className={`verdict verdict-${tone}` + (stale ? " is-stale" : "")}>
      {stale && (
        <p className="stale-note"><Icon name="info" size={16} /> Your answer changed since this check. Check again to update.</p>
      )}
      <div className="verdict-head">
        <span className="verdict-mark"><Icon name={fb.correct ? "check" : "cross"} size={20} /></span>
        <h3 className="verdict-title">{fb.correct ? "Correct." : "Not yet."}</h3>
        <span className="verdict-math math" aria-label={fb.correct ? `the ${what} describes exactly L` : `the ${what} does not describe L`}>
          {LM} <span className="m-op">{fb.correct ? "=" : "≠"}</span> <i>L</i>
        </span>
      </div>
      <p className="verdict-lede">{fb.correct ? <>Your {what} describes exactly this language. <span className="qed" aria-hidden="true" /></> : KIND[fb.verdict as Exclude<Feedback["verdict"], "correct">]}</p>
      {claims.length > 0 && (
        <ol className="claims">
          {claims.map((c, i) => <li key={i}>{c}</li>)}
        </ol>
      )}
      {notes.length > 0 && (
        <ul className="notes" aria-label="Notes">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
      {!fb.correct && onTry && <p className="help">Select any string above to run it through your answer.</p>}
    </div>
  );
}
