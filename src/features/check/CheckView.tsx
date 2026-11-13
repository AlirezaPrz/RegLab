/** The regular-languages tool: the language band, the answer and the verdict, wired to one workbench state. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkbench } from "../../state/useWorkbench.ts";
import { Diagram } from "../../diagram/LazyDiagram.tsx";
import { Definition } from "../../ui/Typeset.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { LanguagePanel } from "./LanguagePanel.tsx";
import { AnswerPanel } from "./AnswerPanel.tsx";
import { FeedbackPanel, conflationClaimNumber } from "./FeedbackPanel.tsx";
import { ProbePanel } from "./ProbePanel.tsx";
import { HintsPanel, SolutionPanel } from "./HintsPanel.tsx";

const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

/** The tool page; owns the workbench state and passes it down to the panels. */
export function CheckView() {
  const { state, dispatch, derived } = useWorkbench();
  const probeRef = useRef<HTMLInputElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const [bandHidden, setBandHidden] = useState(false);
  const verdictRef = useRef<HTMLHeadingElement>(null);

  // on one-column layouts the verdict is below the fold, so bring it into view after a check
  useEffect(() => {
    if (!state.checked || window.innerWidth > 920) return;
    verdictRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }, [state.checked]);

  // when the definition band scrolls away, a slim copy of the language stays pinned on top
  useEffect(() => {
    const el = bandRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setBandHidden(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onTry = (w: string) => {
    dispatch({ type: "probe", value: w });
    probeRef.current?.closest("section")?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
  };

  const r = derived.result;
  const answer = r && r.ok ? r.answer : null;
  const fb = r && r.ok ? r.feedback : null;
  const model = answer && answer.kind !== "regex" ? answer.model : null;
  const steps = derived.probe?.path ?? null;
  const stepIdx = derived.activeStep;
  const active = useMemo(() => (steps && stepIdx !== null ? new Set(steps[stepIdx].states) : undefined), [steps, stepIdx]);
  const marked = fb?.conflated?.studentState ?? null;
  const markedTag = fb?.conflated ? `(${conflationClaimNumber(fb)})` : undefined;
  const langKey = `${state.alphabet}|${state.source}|${state.language}`;

  return (
    <>
      {derived.language && (
        <div className={"pinned" + (bandHidden ? " is-shown" : "")} aria-hidden={!bandHidden}>
          <span className="pinned-def"><Definition alphabet={derived.language.alphabet} source={state.source} text={state.language} /></span>
          {r && r.ok && !derived.stale && (
            <span className={"pinned-verdict " + (fb!.correct ? "is-good" : "is-bad")}>
              <Icon name={fb!.correct ? "check" : "cross"} size={14} />{fb!.correct ? "Correct" : "Not yet"}
            </span>
          )}
        </div>
      )}

      <div ref={bandRef}>
        <LanguagePanel state={state} derived={derived} dispatch={dispatch} onTry={onTry} />
      </div>

      <div className="work">
        <div className="work-answer">
          <AnswerPanel state={state} derived={derived} dispatch={dispatch} />
        </div>
        <div className="work-hints">
          <HintsPanel key={langKey} state={state} hints={derived.hints} dispatch={dispatch} />
        </div>
        <section className="work-right panel" aria-labelledby="verdict-heading">
          <h2 id="verdict-heading" ref={verdictRef} tabIndex={-1} className="h-section">Verdict</h2>
          <div aria-live="polite" aria-atomic="false">
            <FeedbackPanel derived={derived} onTry={onTry} />
          </div>
          {model && (
            <div className="answer-diagram">
              <h3 className="h-sub">Your {answer!.kind.toUpperCase()}</h3>
              <Diagram
                model={model}
                title={`Your ${answer!.kind.toUpperCase()}`}
                active={derived.stale ? undefined : active}
                stuck={!derived.stale && !!active && active.size === 0}
                marked={derived.stale ? null : marked}
                markedTag={markedTag}
                dimmed={derived.stale}
              />
            </div>
          )}
          <ProbePanel ref={probeRef} state={state} probe={derived.probe} activeStep={stepIdx} model={derived.stale ? null : model}
            kind={answer && !derived.stale ? answer.kind : null} dispatch={dispatch} />
        </section>
        {state.solutionShown && derived.hints && (
          <div className="work-solution"><SolutionPanel hints={derived.hints} dispatch={dispatch} /></div>
        )}
      </div>
    </>
  );
}
