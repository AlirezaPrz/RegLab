/** The answer editor: a regular expression, or a DFA/NFA written one transition per line. */
import { useId, useRef } from "react";
import type { Dispatch } from "react";
import type { Action, Derived, WorkbenchState } from "../../state/useWorkbench.ts";
import { FieldError, selectInInput } from "../../ui/FieldError.tsx";
import { SymbolKeys } from "../../ui/SymbolKeys.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { AutomatonEditor } from "../../ui/AutomatonEditor.tsx";

/** The answer editor and the Check button. */
export function AnswerPanel({ state, derived, dispatch }: { state: WorkbenchState; derived: Derived; dispatch: Dispatch<Action> }) {
  const ids = { src: useId(), regex: useId(), help: useId(), err: useId() };
  const regexRef = useRef<HTMLInputElement>(null);

  // errors belong to the text that was checked; once it is edited they no longer point at the right place
  const error = derived.result && !derived.result.ok && !derived.stale ? derived.result.error : null;
  const noLanguage = !derived.language;
  const check = () => dispatch({ type: "check" });

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
          <input id={ids.regex} ref={regexRef} className="mono input-lg" type="text" value={state.regex} placeholder="(a+b)*"
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
        <AutomatonEditor label="Your automaton, one transition per line" value={state.automaton} error={error}
          onChange={(v) => dispatch({ type: "automaton", value: v })}
          onSubmit={check} submitHint={<span className="kbd-hint">Press Ctrl+Enter or ⌘+Enter to check.</span>} />
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
