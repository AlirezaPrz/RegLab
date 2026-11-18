/**
 * The regular-languages tool's state: language → answer → feedback → probe.
 * A reducer holds only what the student typed or chose; everything else is derived from the
 * engine, memoized on the inputs it depends on.
 */
import { useDeferredValue, useMemo, useReducer } from "react";
import {
  readLanguage, readAnswer, checkAnswer, probe, samples, hints, draftAutomaton, toInputError,
  type Language, type AnswerSource, type Answer, type Feedback, type InputError, type Hints, type Probe, type Draft,
} from "../engine/index.ts";
import { EXAMPLES } from "./examples.ts";

/** What the student has typed and chosen. */
export interface WorkbenchState {
  /** the selected example, or "own" while writing their own language */
  example: number | "own";
  /** the example to return to when switching back from "Your own" */
  lastExample: number;
  alphabet: string;
  /** the description as typed */
  language: string;
  answerSource: AnswerSource;
  /** both answer drafts are kept, so switching between them loses nothing */
  regex: string;
  automaton: string;
  /** the "Try a string" input */
  probe: string;
  /** what was submitted with "Check"; feedback is about this, not the live text */
  checked: { source: AnswerSource; text: string } | null;
  /** hint steps opened, in order: 1 what to remember, 2 the states, 3 the DFA (the solution), 4 the smallest DFA */
  hintsOpened: HintStep;
  /** the step on screen (0: none yet). It can be one past hintsOpened while the solution asks to be confirmed. */
  hintShown: HintStep;
  /** the step of the probe path that is highlighted (null: the last) */
  step: number | null;
}

export type HintStep = 0 | 1 | 2 | 3 | 4;

/** What the automaton editor starts with: the two lines every automaton needs. */
export const AUTOMATON_START = "start: q0\naccept: \n";

/** Every change the UI can make. Editing the language clears the check, hints and solution. */
export type Action =
  | { type: "example"; value: number }
  | { type: "mode"; value: "examples" | "own" }
  | { type: "blank" }
  | { type: "alphabet" | "language" | "regex" | "automaton" | "probe"; value: string }
  | { type: "answerSource"; value: AnswerSource }
  | { type: "check" }
  | { type: "showHint"; step: 1 | 2 | 3 | 4 }
  | { type: "confirmSolution" }
  | { type: "hideSolution" }
  | { type: "step"; value: number | null };

const first = EXAMPLES[0];
export const initialState: WorkbenchState = {
  example: 0, lastExample: 0, alphabet: first.alphabet, language: first.text,
  answerSource: "regex", regex: "", automaton: AUTOMATON_START, probe: "",
  checked: null, hintsOpened: 0, hintShown: 0, step: null,
};

/** A new language: the old check, hints and solution no longer apply. */
const languageChanged = (s: WorkbenchState): WorkbenchState => ({ ...s, checked: null, hintsOpened: 0, hintShown: 0, step: null });

function reducer(s: WorkbenchState, a: Action): WorkbenchState {
  switch (a.type) {
    case "example": {
      const ex = EXAMPLES[a.value];
      return languageChanged({ ...s, example: a.value, lastExample: a.value, alphabet: ex.alphabet, language: ex.text });
    }
    case "mode": {
      // "Your own" starts from the current language, so the current check still applies
      if (a.value === "own") return { ...s, example: "own" };
      return reducer(s, { type: "example", value: s.lastExample });
    }
    case "blank": return languageChanged({ ...s, example: "own", language: "" });
    case "alphabet": return languageChanged({ ...s, example: "own", alphabet: a.value });
    case "language": return languageChanged({ ...s, example: "own", language: a.value });
    case "regex": return { ...s, regex: a.value };
    case "automaton": return { ...s, automaton: a.value };
    case "answerSource": return { ...s, answerSource: a.value, step: null };
    case "probe": return { ...s, probe: a.value, step: null };
    case "check": {
      const text = s.answerSource === "regex" ? s.regex : s.automaton;
      return { ...s, checked: { source: s.answerSource, text }, step: null };
    }
    case "showHint": {
      // opened steps can be revisited; the next one opens, except the solution, which asks first
      if (a.step <= s.hintsOpened) return { ...s, hintShown: a.step };
      if (a.step !== s.hintsOpened + 1) return s;
      return a.step === 3 ? { ...s, hintShown: 3 } : { ...s, hintsOpened: a.step, hintShown: a.step };
    }
    case "confirmSolution": return s.hintsOpened === 2 ? { ...s, hintsOpened: 3, hintShown: 3 } : s;
    case "hideSolution": {
      const opened = Math.min(s.hintsOpened, 2) as HintStep;
      return { ...s, hintsOpened: opened, hintShown: Math.min(s.hintShown, opened) as HintStep };
    }
    case "step": return { ...s, step: a.value };
  }
}

/** Values computed from the state with the engine. */
export interface Derived {
  language: Language | null;
  languageError: InputError | null;
  samples: { yes: string[]; no: string[] } | null;
  hints: Hints | null;
  /** result of the last check, if any */
  result:
    | { ok: true; answer: Answer; feedback: Feedback }
    | { ok: false; error: InputError }
    | null;
  /** the answer was edited after it was checked; feedback and errors then refer to the old text */
  stale: boolean;
  probe: Probe | null;
  /** the highlighted step of the probe path: the one the student picked, else the last */
  activeStep: number | null;
  /** the automaton answer as far as it has been written, for the drawing beside the editor */
  draft: Draft | null;
}

/** The tool's state, a dispatch function, and everything derived from them. */
export function useWorkbench() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const lang = useMemo(() => {
    try { return { language: readLanguage(state.alphabet, state.language), error: null }; }
    catch (e) { return { language: null, error: toInputError(e, "language") }; }
  }, [state.alphabet, state.language]);

  const sampleList = useMemo(() => (lang.language ? samples(lang.language) : null), [lang.language]);
  const hintData = useMemo(() => (lang.language ? hints(lang.language) : null), [lang.language]);

  const result = useMemo<Derived["result"]>(() => {
    const c = state.checked;
    if (!c || !lang.language) return null;
    try {
      const answer = readAnswer(c.source, c.text, lang.language.alphabet);
      return { ok: true, answer, feedback: checkAnswer(answer, lang.language) };
    } catch (e) {
      return { ok: false, error: toInputError(e, "answer") };
    }
  }, [state.checked, lang.language]);

  const live = state.answerSource === "regex" ? state.regex : state.automaton;
  const stale = !!state.checked && (state.checked.source !== state.answerSource || state.checked.text !== live);

  const probeResult = useMemo(() => {
    if (!lang.language) return null;
    // a stale answer is not traced: its diagram no longer matches what is on screen
    const answer = result && result.ok && !stale ? result.answer : null;
    return probe(state.probe, lang.language, answer);
  }, [state.probe, lang.language, result, stale]);

  // typing runs ahead of drawing, so a long automaton never slows the editor down
  const automatonText = useDeferredValue(state.automaton);
  const draft = useMemo(
    () => (lang.language && state.answerSource === "automaton" ? draftAutomaton(automatonText, lang.language.alphabet) : null),
    [lang.language, state.answerSource, automatonText],
  );

  const path = probeResult?.path;
  const derived: Derived = {
    language: lang.language, languageError: lang.error,
    samples: sampleList, hints: hintData, result, stale, probe: probeResult,
    activeStep: state.step ?? (path ? path.length - 1 : null),
    draft,
  };
  return { state, dispatch, derived };
}
