/** The answer editor: a regular expression, or a DFA/NFA written one transition per line. */
import { useId, useRef, useState } from "react";
import type { Dispatch } from "react";
import type { Action, Derived, WorkbenchState } from "../../state/useWorkbench.ts";
import { FieldError, lineRange, selectInInput } from "../../ui/FieldError.tsx";
import { SymbolKeys } from "../../ui/SymbolKeys.tsx";
import { Segmented } from "../../ui/Segmented.tsx";

const AUTOMATON_PLACEHOLDER = "start: q0\naccept: q1\nq0 b q0\nq0 a q1\nq1 b q1\nq1 a q2\nq2 a,b q2";

/** The answer editor and the Check button. The gutter mirrors the textarea's scroll so line numbers stay aligned. */
export function AnswerPanel({ state, derived, dispatch }: { state: WorkbenchState; derived: Derived; dispatch: Dispatch<Action> }) {
  const ids = { src: useId(), regex: useId(), auto: useId(), help: useId(), err: useId() };
  const regexRef = useRef<HTMLInputElement>(null);
  const autoRef = useRef<HTMLTextAreaElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // errors belong to the text that was checked; once it is edited they no longer point at the right place
  const error = derived.result && !derived.result.ok && !derived.stale ? derived.result.error : null;
  const noLanguage = !derived.language;
  const check = () => dispatch({ type: "check" });

  const lines = Math.max(8, state.automaton.split("\n").length);

  return (
    <section className="panel" aria-labelledby="answer-heading">
      <h2 id="answer-heading" className="h-section">Your answer</h2>
      <div className="field">
        <span className="label sr-only" id={ids.src}>Answer with</span>
        <Segmented labelledBy={ids.src} value={state.answerSource}
          options={[{ value: "regex", label: "Regular expression" }, { value: "automaton", label: "DFA or NFA" }]}
          onChange={(v) => dispatch({ type: "answerSource", value: v })} />
      </div>

      {state.answerSource === "regex" ? (
        <div className="field">
          <label htmlFor={ids.regex}>Your regular expression</label>
          <input id={ids.regex} ref={regexRef} className="mono input-lg" type="text" value={state.regex} placeholder="b*ab*"
            spellCheck={false} autoComplete="off" autoCapitalize="off" enterKeyHint="go"
            aria-invalid={!!error} aria-describedby={[ids.help, error ? ids.err : ""].join(" ").trim()}
            onChange={(e) => dispatch({ type: "regex", value: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); check(); } }} />
          <SymbolKeys target={regexRef} value={state.regex} label="Regular expression symbols"
            onChange={(v) => dispatch({ type: "regex", value: v })} />
          {error && <FieldError id={ids.err} error={error} source={state.regex}
            onLocate={() => selectInInput(regexRef.current, error.from ?? 0, error.to ?? 0)} />}
          <p id={ids.help} className="help">
            Use <code>+</code> for union, <code>*</code> for star and <code>ε</code> for the empty string. Symbols written next to each other are concatenated. Press Enter to check.
          </p>
        </div>
      ) : (
        <div className="field">
          <label htmlFor={ids.auto}>Your automaton, one transition per line</label>
          <div className={"editor" + (error ? " has-error" : "")}>
            <div className="editor-gutter" aria-hidden="true">
              <div style={{ transform: `translateY(${-scrollTop}px)` }}>
                {Array.from({ length: lines }, (_, i) => (
                  <div key={i} className={error?.line === i + 1 ? "is-error" : undefined}>{i + 1}</div>
                ))}
              </div>
            </div>
            <textarea id={ids.auto} ref={autoRef} className="mono editor-text" rows={8} wrap="off"
              value={state.automaton} placeholder={AUTOMATON_PLACEHOLDER}
              spellCheck={false} autoComplete="off" autoCapitalize="off"
              aria-invalid={!!error} aria-describedby={[ids.help, error ? ids.err : ""].join(" ").trim()}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              onChange={(e) => dispatch({ type: "automaton", value: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); check(); } }} />
          </div>
          <SymbolKeys target={autoRef} value={state.automaton} keys={["ε", ","]} label="Automaton symbols"
            onChange={(v) => dispatch({ type: "automaton", value: v })} />
          {error && <FieldError id={ids.err} error={error} source={state.automaton}
            onLocate={() => {
              const [from, to] = error.line ? lineRange(state.automaton, error.line) : [error.from ?? 0, error.to ?? 0];
              selectInInput(autoRef.current, from, to);
            }} />}
          <p id={ids.help} className="help">
            Write <code>state symbol state</code>, plus a <code>start:</code> line and an <code>accept:</code> line.
            Several symbols can share a line (<code>q2 a,b q2</code>). Use <code>ε</code> or <code>eps</code> for an ε-move, which makes it an NFA.
            Press Ctrl+Enter or ⌘+Enter to check.
          </p>
        </div>
      )}

      <div className="actions">
        <button type="button" className="btn-primary" onClick={check} disabled={noLanguage} aria-describedby={noLanguage ? "need-lang" : undefined}>
          Check my answer
        </button>
        {noLanguage && <span id="need-lang" className="help">Fix the language first.</span>}
      </div>
    </section>
  );
}
