/** The regular-languages tool: the language band, the answer beside the verdict, and the hints below, wired to one workbench state. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkbench } from "../../state/useWorkbench.ts";
import { Diagram } from "../../diagram/LazyDiagram.tsx";
import { Definition } from "../../ui/Typeset.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { LanguagePanel } from "./LanguagePanel.tsx";
import { AnswerPanel } from "./AnswerPanel.tsx";
import { FeedbackPanel, conflationClaimNumber } from "./FeedbackPanel.tsx";
import { ProbePanel } from "./ProbePanel.tsx";
import { StuckSection } from "./StuckSection.tsx";

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
  // the trace shows on the diagram only once a string has been typed or a step picked, so an empty box marks nothing
  const tracing = state.probe.trim() !== "" || state.step !== null;
  const active = useMemo(() => (tracing && steps && stepIdx !== null ? new Set(steps[stepIdx].states) : undefined), [tracing, steps, stepIdx]);
  const marked = fb?.conflated?.studentState ?? null;
  // the drawing beside the editor: the checked answer while it is current, so marks and traces line
  // up with it; otherwise the automaton as far as it has been written
  const draft = derived.draft;
  const drawing = model && !derived.stale
    ? { model, title: `Your ${answer!.kind.toUpperCase()}`, checked: true }
    : draft?.model ? { model: draft.model, title: `Your ${draft.kind.toUpperCase()} so far`, checked: false } : null;
  const skipped = !drawing?.checked && draft ? draft.skipped : [];
  const markedTag = fb?.conflated ? `(${conflationClaimNumber(fb)})` : undefined;
  const langKey = `${state.alphabet}|${state.language}`;

  return (
    <>
      {derived.language && (
        <div className={"pinned" + (bandHidden ? " is-shown" : "")} aria-hidden={!bandHidden}>
          <span className="pinned-def"><Definition alphabet={derived.language.alphabet} text={state.language} /></span>
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
        <section className="work-right panel" aria-labelledby="verdict-heading">
          <h2 id="verdict-heading" ref={verdictRef} tabIndex={-1} className="h-section">Verdict</h2>
          <div aria-live="polite" aria-atomic="false">
            <FeedbackPanel derived={derived} onTry={onTry} />
          </div>
          {fb && !fb.correct && !derived.stale && derived.hints && (
            <p className="verdict-next">
              <button type="button" className="btn-quiet" onClick={() => {
                const h = document.querySelector<HTMLElement>("#stuck h2");
                h?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
                h?.focus({ preventScroll: true });
              }}>Stuck? Get a hint ↓</button>
            </p>
          )}
          {drawing && (
            <div className="answer-diagram">
              <h3 className="h-sub">{drawing.title}</h3>
              <Diagram
                model={drawing.model}
                title={drawing.title}
                active={drawing.checked ? active : undefined}
                stuck={drawing.checked && !!active && active.size === 0}
                marked={drawing.checked ? marked : null}
                markedTag={markedTag}
              />
              {skipped.length > 0 && (
                <p className="help">Not drawn yet: {skipped.length === 1 ? "line" : "lines"} {skipped.join(", ")} can't be read.</p>
              )}
            </div>
          )}
          {!drawing && draft && <p className="help answer-diagram">Add a <code>start:</code> line to see a drawing of your automaton.</p>}
          <ProbePanel ref={probeRef} state={state} probe={derived.probe} activeStep={tracing ? stepIdx : null} model={derived.stale ? null : model}
            kind={answer && !derived.stale ? answer.kind : null} dispatch={dispatch} />
        </section>
      </div>

      <StuckSection key={langKey} state={state} hints={derived.hints} dispatch={dispatch} />
    </>
  );
}
