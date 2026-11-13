/** The landing page walkthrough: as the visitor scrolls four steps, a pinned mini version of the tool highlights the part each step describes. */
import { useEffect, useMemo, useRef, useState } from "react";
import { readLanguage, readAnswer, checkAnswer, samples } from "../../engine/index.ts";
import { Definition } from "../../ui/Typeset.tsx";
import { StringToken } from "../../ui/StringToken.tsx";
import { Diagram } from "../../diagram/LazyDiagram.tsx";
import { Verdict, conflationClaimNumber } from "../check/FeedbackPanel.tsx";

// A DFA for "exactly one a" that forgets to tell one a from two, so every part of the feedback appears.
const LANGUAGE = { alphabet: "a b", text: "#_a(w) = 1" };
const ANSWER = "start: q0\naccept: q1\nq0 b q0\nq0 a q1\nq1 a,b q1";

const STEPS = [
  { title: "Describe the language.", text: "Pick an example or write your own in course notation. RegLab typesets it and lists strings that are in it and not, so you can check it means what you think." },
  { title: "Write your answer.", text: "A regular expression, or a DFA or NFA written one transition per line. Symbols like ε and ∅ have their own keys." },
  { title: "Get the shortest string it gets wrong.", text: "If your answer is wrong, you see the shortest string it wrongly accepts or rejects, not just a red cross." },
  { title: "See where it loses information.", text: "For a DFA, RegLab names two strings that reach the same state but must be told apart, and marks that state on your diagram." },
];

type Demo = ReturnType<typeof buildDemo>;

// everything on the stage is the engine's real output for this example
function buildDemo() {
  const lang = readLanguage(LANGUAGE.alphabet, "spec", LANGUAGE.text);
  const answer = readAnswer("automaton", ANSWER, lang.alphabet);
  return { lang, answer, fb: checkAnswer(answer, lang), sample: samples(lang, 5) };
}

/** True while the viewport matches the media query. */
function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/**
 * The mini tool with the parts for `step` highlighted. `only` renders just those parts,
 * for phones, where each step carries its own copy instead of sharing a pinned stage.
 */
function Stage({ demo, step, only = false }: { demo: Demo; step: number; only?: boolean }) {
  const { lang, answer, fb, sample } = demo;
  const parts = [
    { show: [0], el: (
      <div key="lang" className="stage-part stage-lang">
        <p className="stage-def"><Definition alphabet={lang.alphabet} source="spec" text={LANGUAGE.text} /></p>
        <p className="stage-samples">
          <span className="muted">In <i className="math">L</i></span> {sample.yes.map((w) => <StringToken key={w} value={w} />)}
        </p>
      </div>
    ) },
    { show: [1], el: <div key="answer" className="stage-part stage-answer"><pre className="stage-code">{ANSWER}</pre></div> },
    { show: [1, 3], el: (
      <div key="diagram" className="stage-part stage-diagram">
        {answer.kind !== "regex" && (
          <Diagram model={answer.model} title="The answer's DFA" bare
            marked={fb.conflated?.studentState ?? null}
            markedTag={fb.conflated ? `(${conflationClaimNumber(fb)})` : undefined} />
        )}
      </div>
    ) },
    { show: [2, 3], el: <div key="verdict" className="stage-part stage-verdict"><Verdict answer={answer} fb={fb} stale={false} /></div> },
  ];
  return (
    <div className={"how-stage" + (only ? " is-inline" : "")} data-step={step} role="group"
      aria-label={`Example: checking a DFA for “exactly one a”, step ${step + 1}`}>
      {parts.filter((p) => !only || p.show.includes(step)).map((p) => p.el)}
    </div>
  );
}

export function HowItWorks() {
  const demo = useMemo(buildDemo, []);
  const narrow = useMedia("(max-width: 900px)");
  const [step, setStep] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    // the step crossing the middle of the viewport is the active one
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step));
    }, { rootMargin: "-50% 0px -50% 0px" });
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section className="how" aria-labelledby="how-h">
      <h2 id="how-h" className="how-h">How the regular-languages tool works</h2>
      <div className="how-grid">
        <ol className="how-steps">
          {STEPS.map((s, i) => (
            <li key={i} ref={(el) => { stepRefs.current[i] = el; }} data-step={i} className={i === step ? "is-current" : undefined}>
              <h3 className="how-step-title"><span className="how-step-n" aria-hidden="true">{i + 1}</span>{s.title}</h3>
              <p>{s.text}</p>
              {narrow && <Stage demo={demo} step={i} only />}
            </li>
          ))}
        </ol>
        {!narrow && <Stage demo={demo} step={step} />}
      </div>
    </section>
  );
}
