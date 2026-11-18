/** Regex → automata: the NFA built from a regex, the DFA the subset construction makes from it, and the smallest DFA. */
import { Fragment, useId, useRef, useState, type ReactNode } from "react";
import { automatonText, convertRegex, type AutomatonModel, type RegexConversion } from "../../engine/index.ts";
import { Diagram, DRAW_LIMIT } from "../../diagram/LazyDiagram.tsx";
import { TransitionTable } from "../../diagram/TransitionTable.tsx";
import { FieldError, selectInInput } from "../../ui/FieldError.tsx";
import { SymbolKeys } from "../../ui/SymbolKeys.tsx";
import { AlphabetField } from "../../ui/AlphabetField.tsx";
import { SampleStrings } from "../../ui/SampleStrings.tsx";
import { TypesetRegex } from "../../ui/Typeset.tsx";
import { CopyButton } from "../../ui/CopyButton.tsx";
import { MergeTable } from "../../ui/MergeTable.tsx";
import { plural } from "../../ui/text.ts";
import { REGEX_EXAMPLES } from "./examples.ts";
import { useConversion } from "./useConversion.ts";
import type { Draft } from "./ConvertView.tsx";

type Step = "nfa" | "dfa" | "minimal";
const STEPS: { id: Step; name: string }[] = [
  { id: "nfa", name: "NFA" },
  { id: "dfa", name: "DFA" },
  { id: "minimal", name: "Smallest DFA" },
];

/** How each automaton was made. */
function caption(step: Step, c: RegexConversion): ReactNode {
  if (step === "nfa") return <>Built from <i className="math">R</i> piece by piece: each symbol is two states joined by that symbol, and union, concatenation and star are wired together with ε-moves.</>;
  if (step === "dfa") return <>The subset construction on the NFA: each DFA state is the set of NFA states the NFA could be in after the same input. A set is accepting when it contains an accepting NFA state (in bold).{c.dfa.names.includes("∅") && <> ∅ is the empty set, a dead state: once there, nothing is accepted.</>}</>;
  const n = c.minimal.names.length;
  return c.dfa.names.length > n
    ? <>The DFA with the states that no string can tell apart merged; the table shows which. No DFA for this language has fewer than {plural(n, "state")}.</>
    : <>The subset construction already gave the smallest DFA: no DFA for this language has fewer than {plural(n, "state")}. Only the names change.</>;
}

export function RegexToAutomata({ switcher, draft, onChange, onConvertBack }: {
  switcher: ReactNode;
  draft: Draft;
  onChange: (d: Draft) => void;
  /** hands an automaton shown here to the other direction */
  onConvertBack: (automaton: string) => void;
}) {
  const ids = { rx: useId(), help: useId(), err: useId(), out: useId(), tabs: useId() };
  const rxRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [step, setStep] = useState<Step>("nfa");
  const { result: c, input, error, errorInput, stale } = useConversion(convertRegex, draft.alphabet, draft.text);
  const rxErr = error && error.field !== "alphabet" ? error : null;
  const alphaErr = error && error.field === "alphabet" ? error : null;

  const model: AutomatonModel | null = c ? c[step] : null;
  const accepting = c ? new Set(c.nfa.names.filter((_, i) => c.nfa.accept[i])) : new Set<string>();
  const moveTab = (i: number) => {
    const n = (i + STEPS.length) % STEPS.length;
    setStep(STEPS[n].id);
    tabRefs.current[n]?.focus();
  };

  return (
    <>
      <section className="band" aria-label="The regular expression">
        <div className="band-inner">
          <div>
            {switcher}
            <AlphabetField value={draft.alphabet} error={alphaErr} onChange={(alphabet) => onChange({ ...draft, alphabet })} />
            <div className="field">
              <label htmlFor={ids.rx}>Regular expression <i className="math">R</i></label>
              <input id={ids.rx} ref={rxRef} className="mono input-lg" type="text" value={draft.text} placeholder="(a+b)*aa"
                spellCheck={false} autoComplete="off" autoCapitalize="off"
                aria-invalid={!!rxErr} aria-describedby={[ids.help, rxErr ? ids.err : ""].join(" ").trim()}
                onChange={(e) => onChange({ ...draft, text: e.target.value })} />
              <SymbolKeys target={rxRef} value={draft.text} label="Regular expression symbols"
                onChange={(v) => onChange({ ...draft, text: v })} />
              {rxErr && <FieldError id={ids.err} error={rxErr} source={errorInput}
                onLocate={() => selectInInput(rxRef.current, rxErr.from ?? 0, rxErr.to ?? 0)} />}
              <p id={ids.help} className="help">
                Use <code>+</code> for union, <code>*</code> for star and <code>ε</code> for the empty string. Symbols written next to each other are concatenated.
              </p>
            </div>
            <div className="chips" role="group" aria-label="Example expressions">
              <span className="label">Examples</span>
              {REGEX_EXAMPLES.map((x) => (
                <button key={x} type="button" className={"chip mono" + (x === draft.text ? " is-on" : "")}
                  onClick={() => onChange({ alphabet: "a b", text: x })}>{x}</button>
              ))}
            </div>
          </div>

          <div className="band-definition" aria-live="polite">
            {c ? (
              <div className={stale ? "is-stale" : undefined}>
                <p className="definition"><span className="math"><i>R</i> <span className="m-op">=</span> <TypesetRegex text={input} /></span></p>
                {stale && <p className="help">The last expression that could be read.</p>}
                <SampleStrings samples={c.samples} of={<><i className="math">L</i>(<i className="math">R</i>)</>} />
              </div>
            ) : (
              <p className="definition definition-empty"><span className="math"><i>R</i> <span className="m-op">=</span> ?</span></p>
            )}
          </div>
        </div>
      </section>

      <section className="out" aria-labelledby={ids.out}>
        <h2 id={ids.out} className="h-section">Automata for <i className="math">R</i></h2>
        {!c ? (
          <p className="out-empty">Type a regular expression, or pick an example, to see an NFA for it and the DFAs that come from it.</p>
        ) : (
          <>
            {stale && <p className="stale-note" role="status">Showing the last expression that could be read. Fix the error above to update.</p>}
            <div className="pipeline" role="tablist" aria-label="Automata built from R, in order">
              {STEPS.map((s, i) => (
                <Fragment key={s.id}>
                  {i > 0 && <span className="pipeline-arrow" aria-hidden="true">→</span>}
                  <button ref={(el) => { tabRefs.current[i] = el; }} type="button" role="tab" id={`${ids.tabs}-${s.id}`}
                    aria-selected={step === s.id} aria-controls={`${ids.tabs}-panel`} tabIndex={step === s.id ? 0 : -1}
                    className="pipeline-step" onClick={() => setStep(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight") { e.preventDefault(); moveTab(i + 1); }
                      if (e.key === "ArrowLeft") { e.preventDefault(); moveTab(i - 1); }
                    }}>
                    <span className="pipeline-name">{s.name}</span>
                    <span className="pipeline-count">{plural(c[s.id].names.length, "state")}</span>
                  </button>
                </Fragment>
              ))}
            </div>

            <div role="tabpanel" id={`${ids.tabs}-panel`} aria-labelledby={`${ids.tabs}-${step}`}>
              <p className="out-caption">{caption(step, c)}</p>
              <div className={"figure" + (step !== "nfa" ? " has-aside" : "")}>
                <div>
                  {model!.names.length <= DRAW_LIMIT
                    ? <Diagram key={step} model={model!} title={`${STEPS.find((s) => s.id === step)!.name} for R`} dimmed={stale} />
                    : <>
                        <p className="help">With {plural(model!.names.length, "state")} this is too large to draw clearly, so here is its transition table.</p>
                        <TransitionTable model={model!} caption={STEPS.find((s) => s.id === step)!.name} />
                      </>}
                </div>
                {step === "dfa" && (
                  <table className="ttable side-table">
                    <caption>What each DFA state stands for</caption>
                    <thead><tr><th scope="col">DFA state</th><th scope="col">Set of NFA states</th></tr></thead>
                    <tbody>
                      {c.dfa.names.map((name, i) => (
                        <tr key={name}>
                          <th scope="row" className="mono">{name}</th>
                          <td className="mono">
                            {"{"}{c.subsets[i].map((q, k) => (
                              <Fragment key={q}>{k > 0 && ", "}{accepting.has(q) ? <b>{q}</b> : q}</Fragment>
                            ))}{"}"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {step === "minimal" && <MergeTable names={c.minimal.names} merged={c.merged} caption="Which DFA states each one merges" />}
              </div>
              <div className="actions">
                <CopyButton text={automatonText(model!)} label="Copy as text" />
                <button type="button" className="btn-quiet" onClick={() => onConvertBack(automatonText(model!))}>Convert this back to a regex</button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
