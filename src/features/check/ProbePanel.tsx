/** "Try a string": whether a string is in the language, whether the answer accepts it, and its path. */
import { forwardRef, useId } from "react";
import type { Dispatch } from "react";
import type { AutomatonModel, Probe } from "../../engine/index.ts";
import { show } from "../../engine/index.ts";
import type { Action, WorkbenchState } from "../../state/useWorkbench.ts";
import { Icon } from "../../ui/Icon.tsx";

/** "Try a string". Each step of the path is a button that highlights its states on the diagram. */
export const ProbePanel = forwardRef<HTMLInputElement, {
  state: WorkbenchState;
  probe: Probe | null;
  activeStep: number | null;
  model: AutomatonModel | null;
  kind: "regex" | "dfa" | "nfa" | null;
  dispatch: Dispatch<Action>;
}>(function ProbePanel({ state, probe: p, activeStep, model, kind, dispatch }, ref) {
  const ids = { input: useId(), out: useId() };
  const steps = p?.path ?? null;
  // an NFA step is a set of states; a DFA step is one state, or none once a missing move is taken
  const setName = (states: number[]) => {
    if (!model) return "";
    if (kind === "nfa") return states.length ? "{" + states.map((i) => model.names[i]).join(", ") + "}" : "∅";
    return states.length ? model.names[states[0]] : "dead";
  };

  return (
    <section className="probe" aria-labelledby="probe-heading">
      <h3 id="probe-heading" className="h-sub">Try a string</h3>
      <label htmlFor={ids.input} className="label">A string over the alphabet (leave empty for ε)</label>
      <input id={ids.input} ref={ref} className="mono" type="text" value={state.probe}
        spellCheck={false} autoComplete="off" autoCapitalize="off"
        aria-describedby={ids.out}
        onChange={(e) => dispatch({ type: "probe", value: e.target.value })} />

      <div id={ids.out} aria-live="polite">
        {p?.foreign ? (
          <p className="field-error"><Icon name="alert" size={16} /><span>"{p.foreign}" is not in the alphabet.</span></p>
        ) : p && (
          <ul className="probe-facts">
            <li>
              <span className="math fact-sym" aria-hidden="true">{p.inLanguage ? "∈" : "∉"}</span>
              <span><code className="tok">{show(p.input)}</code> {p.inLanguage ? "is in the language" : "is not in the language"}</span>
            </li>
            {p.accepted !== null && (
              <li className={p.accepted === p.inLanguage ? "fact-good" : "fact-bad"}>
                <span className="fact-sym"><Icon name={p.accepted === p.inLanguage ? "check" : "cross"} size={16} /></span>
                <span>Your answer {p.accepted ? "accepts" : "rejects"} it{p.accepted === p.inLanguage ? ", which is right" : ", which is wrong"}.</span>
              </li>
            )}
          </ul>
        )}
      </div>

      {steps && model && !p?.foreign && (
        <>
          <ol className="path" aria-label="Path through your automaton">
            {steps.map((s, i) => (
              <li key={i}>
                {s.symbol !== null && <span className="path-sym" aria-label={`reads ${s.symbol}`}>{s.symbol}</span>}
                <button type="button" className="path-state" aria-pressed={i === activeStep}
                  aria-label={`Step ${i}: ${setName(s.states)}`}
                  onClick={() => dispatch({ type: "step", value: i })}>{setName(s.states)}</button>
              </li>
            ))}
          </ol>
          <p className="help">
            {kind === "nfa" ? "Each step shows the set of states the NFA could be in. " : ""}
            Select a step to see it on the diagram.
          </p>
        </>
      )}
    </section>
  );
});
