/**
 * State for the Regular Languages tool. The reducer holds only what the student typed or chose;
 * everything else is derived from the engine and memoized.
 */
import { useDeferredValue, useMemo, useReducer } from "react";
import {
  readLanguage, readAnswer, checkAnswer, probe, samples, hints, draftAutomaton, toInputError,
  type Language, type AnswerSource, type Answer, type Feedback, type InputError, type Hints, type Probe, type Draft, type Samples,
} from "../engine/index.ts";
import { EXAMPLES } from "./examples.ts";

/** What the student has typed and chosen. */
export interface WorkbenchState {
  example: number | "own";
  /** where "Examples" returns to after "Your own" */
  lastExample: number;
  alphabet: string;
  /** the description */
  language: string;
  answerSource: AnswerSource;
  /** both drafts are kept, so switching answer type loses nothing */
  regex: string;
  automaton: string;
  /** the "Try a string" input */
  probe: string;
  /** the submitted answer; feedback refers to this, not the live text */
  checked: { source: AnswerSource; text: string } | null;
  /** 1 what to remember, 2 what each state means, 3 the solution, 4 the smallest DFA */
  hintsOpened: HintStep;
  /** the highlighted step of the probe path (null: the last) */
  step: number | null;
}

type HintStep = 0 | 1 | 2 | 3 | 4;

/** The two lines every automaton needs. */
const AUTOMATON_START = "start: q0\naccept: \n";

/** Every change the UI can make. Changing the language resets the check and the hints. */
export type Action =
  | { type: "example"; value: number }
  | { type: "mode"; value: "examples" | "own" }
  | { type: "blank" }
  | { type: "alphabet" | "language" | "regex" | "automaton" | "probe"; value: string }
  | { type: "answerSource"; value: AnswerSource }
  | { type: "check" }
  | { type: "openHint"; step: 1 | 2 | 3 | 4 }
  | { type: "hideSolution" }
  | { type: "step"; value: number | null };

const first = EXAMPLES[0];
const initialState: WorkbenchState = {
  example: 0, lastExample: 0, alphabet: first.alphabet, language: first.text,
  answerSource: "regex", regex: "", automaton: AUTOMATON_START, probe: "",
  checked: null, hintsOpened: 0, step: null,
};

const languageChanged = (s: WorkbenchState): WorkbenchState => ({ ...s, checked: null, hintsOpened: 0, step: null });

function reducer(s: WorkbenchState, a: Action): WorkbenchState {
  switch (a.type) {
    case "example": {
      const ex = EXAMPLES[a.value];
      return languageChanged({ ...s, example: a.value, lastExample: a.value, alphabet: ex.alphabet, language: ex.text });
    }
    case "mode": {
      // "Your own" starts from the current language, so the check still applies
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
    // hints open in order and stay open; hiding the solution also hides the smallest DFA
    case "openHint": return a.step === s.hintsOpened + 1 ? { ...s, hintsOpened: a.step } : s;
    case "hideSolution": return { ...s, hintsOpened: Math.min(s.hintsOpened, 2) as HintStep };
    case "step": return { ...s, step: a.value };
  }
}

/** Everything computed from the state. */
export interface Derived {
  language: Language | null;
  languageError: InputError | null;
  samples: Samples | null;
  hints: Hints | null;
  result:
    | { ok: true; answer: Answer; feedback: Feedback }
    | { ok: false; error: InputError }
    | null;
  /** edited since checked: feedback refers to the old text */
  stale: boolean;
  probe: Probe | null;
  /** the picked probe step, else the last */
  activeStep: number | null;
  /** the automaton answer as far as it has been typed */
  draft: Draft | null;
}

/** The tool's state, its dispatch, and everything derived from it. */
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
    // a stale answer isn't traced: its diagram no longer matches the text
    const answer = result && result.ok && !stale ? result.answer : null;
    return probe(state.probe, lang.language, answer);
  }, [state.probe, lang.language, result, stale]);

  // drawing lags typing, so a long automaton never slows the editor
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
