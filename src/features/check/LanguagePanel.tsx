/** The language band: pick an example or write your own, and see it typeset with sample strings. */
import { useId, useRef } from "react";
import type { Dispatch } from "react";
import type { Action, Derived, WorkbenchState } from "../../state/useWorkbench.ts";
import { EXAMPLES } from "../../state/examples.ts";
import { FieldError, selectInInput } from "../../ui/FieldError.tsx";
import { SymbolKeys } from "../../ui/SymbolKeys.tsx";
import { StringToken } from "../../ui/StringToken.tsx";
import { Definition } from "../../ui/Typeset.tsx";
import { Segmented } from "../../ui/Segmented.tsx";

/** Condition forms the description parser understands, shown under "Condition syntax". */
const SYNTAX: [string, string][] = [
  ["#_ab(w) = 1", "how often ab appears"],
  ["starts with aba", "prefix"],
  ["ends in aa", "suffix"],
  ["contains bab", "substring"],
  ["|w| is even", "length"],
  ["first = last", "first and last symbols"],
  ["sum divisible by 3", "digit alphabets"],
  ["= != >= <= > <", "compare a count"],
  ["mod 3 = 0", "count modulo m"],
  ["and  or  xor  not", "combine, with ( )"],
];

const SPEC_HELP = (
  <details className="syntax">
    <summary>Condition syntax</summary>
    <dl>
      {SYNTAX.map(([k, v]) => <div key={k}><dt><code>{k}</code></dt><dd>{v}</dd></div>)}
    </dl>
  </details>
);

/** The language band. onTry runs a sample string through "Try a string". */
export function LanguagePanel({ state, derived, dispatch, onTry }: {
  state: WorkbenchState;
  derived: Derived;
  dispatch: Dispatch<Action>;
  onTry: (w: string) => void;
}) {
  const mode = state.example === "own" ? "own" : "examples";
  const ids = { ex: useId(), alpha: useId(), lang: useId(), help: useId(), err: useId(), alphaErr: useId() };
  const langRef = useRef<HTMLTextAreaElement>(null);
  const alphaRef = useRef<HTMLInputElement>(null);
  const err = derived.languageError;
  // an empty description is still being written, so it is not reported as an error
  const showErr = err && (err.field === "alphabet" || state.language.trim() !== "");
  const langErr = showErr && err!.field === "language" ? err : null;
  const alphaErr = showErr && err!.field === "alphabet" ? err : null;


  return (
    <section className="band" aria-labelledby="lang-heading">
      <div className="band-inner">
        <div className="band-inputs">
          <div className="lang-head">
            <h2 id="lang-heading" className="h-section">The language</h2>
            <Segmented labelledBy="lang-heading" value={mode}
              options={[{ value: "examples", label: "Examples" }, { value: "own", label: "Your own" }]}
              onChange={(v) => dispatch({ type: "mode", value: v })} />
          </div>

          {mode === "examples" ? (
            <fieldset className="examples">
              <legend className="sr-only">Example languages</legend>
              {EXAMPLES.map((ex, i) => (
                <label key={i} className={"example" + (state.example === i ? " is-on" : "")}>
                  <input type="radio" name={ids.ex} checked={state.example === i}
                    onChange={() => dispatch({ type: "example", value: i })} />
                  <span className="example-name">{ex.name}</span>
                </label>
              ))}
              <p className="help examples-note">The selected language is written out on the right, with strings that are and aren't in it.</p>
              <div className="examples-foot">
                <button type="button" className="btn-quiet" onClick={() => dispatch({ type: "mode", value: "own" })}>Edit this one</button>
                <button type="button" className="linkish-quiet" onClick={() => dispatch({ type: "blank" })}>Start from blank</button>
              </div>
            </fieldset>
          ) : (
            <>
              <div className="row">
                <div className="field field-narrow">
                  <label htmlFor={ids.alpha}>Alphabet Σ</label>
                  <input id={ids.alpha} ref={alphaRef} className="mono" type="text" value={state.alphabet}
                    spellCheck={false} autoComplete="off" autoCapitalize="off"
                    aria-invalid={!!alphaErr} aria-describedby={alphaErr ? ids.alphaErr : undefined}
                    onChange={(e) => dispatch({ type: "alphabet", value: e.target.value })} />
                </div>
                <div className="field">
                  <span className="label" id={ids.lang + "-src"}>Given as</span>
                  <Segmented labelledBy={ids.lang + "-src"} value={state.source}
                    options={[{ value: "spec", label: "A description" }, { value: "regex", label: "A regular expression" }]}
                    onChange={(v) => dispatch({ type: "source", value: v })} />
                </div>
              </div>
              {alphaErr && <FieldError id={ids.alphaErr} error={alphaErr} source={state.alphabet} onLocate={() => selectInInput(alphaRef.current, alphaErr.from ?? 0, alphaErr.to ?? 0)} />}
              <div className="field">
                <label htmlFor={ids.lang}>{state.source === "spec" ? "All strings w such that…" : "The language of this regular expression"}</label>
                <textarea id={ids.lang} ref={langRef} className="mono" rows={2} value={state.language}
                  placeholder={state.source === "spec" ? "ends in aa and |w| is even" : "(a+b)*aa"}
                  spellCheck={false} autoComplete="off" autoCapitalize="off"
                  aria-invalid={!!langErr} aria-describedby={[ids.help, langErr ? ids.err : ""].join(" ").trim()}
                  onChange={(e) => dispatch({ type: "language", value: e.target.value })} />
                {state.source === "regex" && (
                  <SymbolKeys target={langRef} value={state.language} label="Regular expression symbols"
                    onChange={(v) => dispatch({ type: "language", value: v })} />
                )}
                {langErr && <FieldError id={ids.err} error={langErr} source={state.language} onLocate={() => selectInInput(langRef.current, langErr.from ?? 0, langErr.to ?? 0)} />}
                {state.source === "spec"
                  ? <div id={ids.help} className="help">Describe which strings are in the language. {SPEC_HELP}</div>
                  : <p id={ids.help} className="help">Enter any regular expression you already know is right, for example from solutions or a textbook.</p>}
              </div>
            </>
          )}
        </div>

        <div className="band-definition" aria-live="polite">
          {derived.language ? (
            <>
              <p className="definition"><Definition alphabet={derived.language.alphabet} source={state.source} text={state.language} /></p>
              {derived.samples && (
                <dl className="samples">
                  <dt>In <i className="math">L</i></dt>
                  <dd>{derived.samples.yes.length ? derived.samples.yes.map((w) => <StringToken key={w} value={w} onTry={onTry} />) : <span className="muted">no strings at all</span>}</dd>
                  <dt>Not in <i className="math">L</i></dt>
                  <dd>{derived.samples.no.length ? derived.samples.no.map((w) => <StringToken key={w} value={w} onTry={onTry} />) : <span className="muted">none: every string is in the language</span>}</dd>
                </dl>
              )}
              <p className="help">Check these match what you meant before answering.</p>
            </>
          ) : (
            <p className="definition definition-empty"><span className="math"><i>L</i> <span className="m-op">=</span> ?</span></p>
          )}
        </div>
      </div>
    </section>
  );
}
