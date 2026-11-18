/** Automaton → regex: a DFA or NFA written as transitions, drawn as it is typed, and a regex for its language. */
import { useId, type ReactNode } from "react";
import { convertAutomaton } from "../../engine/index.ts";
import { Diagram } from "../../diagram/LazyDiagram.tsx";
import { AutomatonEditor } from "../../ui/AutomatonEditor.tsx";
import { AlphabetField } from "../../ui/AlphabetField.tsx";
import { SampleStrings } from "../../ui/SampleStrings.tsx";
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
  /** hands the regex shown here to the other direction */
  onConvertBack: (regex: string) => void;
}) {
  const outId = useId();
  const { result: c, error, errorInput, stale } = useConversion(convertAutomaton, draft.alphabet, draft.text);
  const inputErr = error && error.field !== "alphabet" ? error : null;
  const alphaErr = error && error.field === "alphabet" ? error : null;
  const kind = c ? c.kind.toUpperCase() : "automaton";

  return (
    <>
      <section className="band" aria-label="The automaton">
        <div className="band-inner">
          <div>
            {switcher}
            <AlphabetField value={draft.alphabet} error={alphaErr} onChange={(alphabet) => onChange({ ...draft, alphabet })} />
            {/* converting lags typing; show an error only once it is about the text on screen */}
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
                : <p className="out-empty">The diagram appears here as you write the automaton.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="out" aria-labelledby={outId}>
        <h2 id={outId} className="h-section">A regular expression for it</h2>
        {!c ? (
          <p className="out-empty">Write a DFA or NFA, or pick an example, to get a regular expression for its language.</p>
        ) : (
          <>
            {stale && <p className="stale-note" role="status">Showing the last automaton that could be read. Fix the error above to update.</p>}
            <div aria-live="polite">
              <p className="convert-regex math"><i>R</i> <span className="m-op">=</span> <TypesetRegex text={c.regex} /></p>
              <p className="out-caption">
                {c.eliminatedFrom === "automaton"
                  ? <>Found by state elimination on your {kind}: </>
                  : <>Found by state elimination on the smallest DFA for the same language ({plural(c.minStates, "state")}), which gave a shorter expression than your {kind}: </>}
                states are removed one at a time, and each path through a removed state becomes a regular expression on a
                single move. Other expressions describe the same language too.
              </p>
              <SampleStrings samples={c.samples} of={<><i className="math">L</i>(<i className="math">R</i>)</>} />
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
