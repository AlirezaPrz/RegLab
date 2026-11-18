/** Automaton → regex: a DFA or NFA written as transitions, drawn as it is typed, and a regular expression for its language. */
import { useId, useRef, type ReactNode } from "react";
import { convertAutomaton } from "../../engine/index.ts";
import { Diagram } from "../../diagram/LazyDiagram.tsx";
import { FieldError, selectInInput } from "../../ui/FieldError.tsx";
import { AutomatonEditor } from "../../ui/AutomatonEditor.tsx";
import { StringToken } from "../../ui/StringToken.tsx";
import { TypesetRegex } from "../../ui/Typeset.tsx";
import { CopyButton } from "../../ui/CopyButton.tsx";
import { plural } from "../../ui/text.ts";
import { AUTOMATON_EXAMPLES } from "./examples.ts";
import { useConversion } from "./useConversion.ts";
import type { Draft } from "./ConvertView.tsx";

export function AutomatonToRegex({ switcher, draft, onChange, onConvertBack }: {
  switcher: ReactNode;
  draft: Draft;
  onChange: (d: Draft) => void;
  /** convert the regex shown here back to automata, in the other direction */
  onConvertBack: (regex: string) => void;
}) {
  const ids = { alpha: useId(), alphaErr: useId(), out: useId() };
  const alphaRef = useRef<HTMLInputElement>(null);
  const { result: c, error, errorInput, stale } = useConversion(convertAutomaton, draft.alphabet, draft.text);
  const inputErr = error && error.field !== "alphabet" ? error : null;
  const alphaErr = error && error.field === "alphabet" ? error : null;
  const kind = c ? c.kind.toUpperCase() : "automaton";

  return (
    <>
      <section className="band" aria-label="The automaton">
        <div className="band-inner">
          <div className="band-inputs">
            {switcher}
            <div className="row">
              <div className="field field-narrow">
                <label htmlFor={ids.alpha}>Alphabet Σ</label>
                <input id={ids.alpha} ref={alphaRef} className="mono" type="text" value={draft.alphabet}
                  spellCheck={false} autoComplete="off" autoCapitalize="off"
                  aria-invalid={!!alphaErr} aria-describedby={alphaErr ? ids.alphaErr : undefined}
                  onChange={(e) => onChange({ ...draft, alphabet: e.target.value })} />
              </div>
            </div>
            {alphaErr && <FieldError id={ids.alphaErr} error={alphaErr} source={draft.alphabet}
              onLocate={() => selectInInput(alphaRef.current, alphaErr.from ?? 0, alphaErr.to ?? 0)} />}
            {/* typing runs ahead of converting; an error is shown once it is about the text on screen */}
            <AutomatonEditor label="A DFA or NFA, one transition per line" value={draft.text}
              error={inputErr && errorInput === draft.text ? inputErr : null}
              onChange={(text) => onChange({ ...draft, text })} />
            <div className="chips" role="group" aria-label="Example automata">
              <span className="label">Examples</span>
              {AUTOMATON_EXAMPLES.map((x) => (
                <button key={x.name} type="button" className={"chip" + (x.text === draft.text ? " is-on" : "")}
                  onClick={() => onChange({ alphabet: "a b", text: x.text })}>{x.name}</button>
              ))}
            </div>
          </div>

          <div className="band-definition">
            <h2 className="h-sub">{c ? `Your ${kind}` : "Your automaton"}</h2>
            <div className="convert-machine">
              {c
                ? <Diagram model={c.model} title={`Your ${kind}`} dimmed={stale} />
                : <p className="convert-empty">The diagram appears here as you write the automaton.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="convert-out" aria-labelledby={ids.out}>
        <h2 id={ids.out} className="h-section">A regular expression for it</h2>
        {!c ? (
          <p className="convert-empty">Write a DFA or NFA, or pick an example, to get a regular expression for its language.</p>
        ) : (
          <>
            {stale && <p className="stale-note" role="status">Showing the last automaton that could be read. Fix the error above to update.</p>}
            <div className="convert-result" aria-live="polite">
              <p className="convert-regex math"><i>R</i> <span className="m-op">=</span> <TypesetRegex text={c.regex} /></p>
              <p className="convert-caption">
                {c.eliminatedFrom === "automaton"
                  ? <>Found by state elimination on your {kind}: </>
                  : <>Found by state elimination on the smallest DFA for the same language ({plural(c.minStates, "state")}), which gave a shorter expression than your {kind}: </>}
                states are removed one at a time, and each path through a removed state becomes a regular expression on a
                single move. Other expressions describe the same language too.
              </p>
              <dl className="samples">
                <dt>In <i className="math">L</i>(<i className="math">R</i>)</dt>
                <dd>{c.samples.yes.length ? c.samples.yes.map((w) => <StringToken key={w} value={w} />) : <span className="muted">no strings at all</span>}</dd>
                <dt>Not in <i className="math">L</i>(<i className="math">R</i>)</dt>
                <dd>{c.samples.no.length ? c.samples.no.map((w) => <StringToken key={w} value={w} />) : <span className="muted">none: every string is in the language</span>}</dd>
              </dl>
              <div className="actions">
                <CopyButton text={c.regex} label="Copy" />
                <button type="button" className="btn-quiet" onClick={() => onConvertBack(c.regex)}>Convert this back to automata</button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
