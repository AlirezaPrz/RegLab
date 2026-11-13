/**
 * The study-session layer over the engine: turns what the student typed into everything the UI
 * shows, as plain data (verdicts, counterexamples, hints, traces, diagram models). Components
 * only render these results; no automata logic lives in them.
 */
import {
  type DFA, type ParsedAutomaton,
  regexToDfa, parseSpec, parseAutomaton, nfaToDfa, compare, minimize, dfaToRegex,
  accepts, trace, sampleStrings, nerodeClasses, parseAlphabet, EngineError,
} from "./engine.ts";


/** How the reference language was given: a description ("spec") or a regular expression. */
export type LanguageSource = "spec" | "regex";

/** The reference language, ready to check answers against. */
export interface Language {
  alphabet: string[];
  /** its minimal DFA */
  dfa: DFA;
  source: LanguageSource;
  /** the description or regex as typed */
  text: string;
}

/** Reads the alphabet and the reference language. Throws EngineError with `field` naming the input that is wrong. */
export function readLanguage(alphabetSrc: string, source: LanguageSource, src: string): Language {
  let alphabet: string[];
  try { alphabet = parseAlphabet(alphabetSrc); } catch (e) { throw tag(e, "alphabet"); }
  try {
    const dfa = source === "spec" ? parseSpec(src, alphabet) : regexToDfa(src, alphabet);
    return { alphabet, dfa, source, text: src };
  } catch (e) { throw tag(e, "language"); }
}

/** The shortest strings in and not in the language, for the student to sanity-check their description. */
export function samples(lang: Language, limit = 7): { yes: string[]; no: string[] } {
  return { yes: sampleStrings(lang.dfa, true, limit), no: sampleStrings(lang.dfa, false, limit) };
}

/** Progressive hints, ending with the full solution. */
export interface Hints {
  /** states in the minimal DFA */
  minStates: number;
  /** one shortest string reaching each state of the minimal DFA */
  classes: { rep: string; accepting: boolean }[];
  /** the minimal DFA itself: the full solution */
  solution: AutomatonModel;
  /** a regular expression for the language: the reference itself when one was given, else built from the DFA */
  regex: string;
}

/** Hints for a language. The regex is the reference itself when one was given, so the solution matches what the student saw. */
export function hints(lang: Language): Hints {
  const classes = nerodeClasses(lang.dfa);
  const min = minimize(lang.dfa).dfa;
  const regex = lang.source === "regex" ? lang.text.replace(/\s+/g, "") : dfaToRegex(lang.dfa);
  return { minStates: classes.length, classes, solution: modelFromDfa(min), regex };
}


/** How the student answers: a regular expression, or a DFA/NFA written as transitions. */
export type AnswerSource = "regex" | "automaton";

/** A diagram-ready description of an automaton. */
export interface AutomatonModel {
  names: string[];
  start: number;
  accept: boolean[];
  /** one entry per (from, to) pair, symbols merged */
  edges: { from: number; to: number; symbols: string[] }[];
}

/**
 * A parsed answer. Every kind has a total DFA for its language; automaton answers also keep the
 * student's own states, and their DFA is the subset construction (labels are sets of student states).
 */
export type Answer =
  | { kind: "regex"; dfa: DFA }
  | { kind: "dfa" | "nfa"; dfa: DFA<number[]>; parsed: ParsedAutomaton; model: AutomatonModel };

/** Parses an answer. An automaton counts as a DFA only if it is deterministic; otherwise it is checked as an NFA. Throws EngineError tagged "answer". */
export function readAnswer(source: AnswerSource, src: string, alphabet: string[]): Answer {
  try {
    if (source === "regex") return { kind: "regex", dfa: regexToDfa(src, alphabet) };
    const parsed = parseAutomaton(src, alphabet);
    const dfa = nfaToDfa(parsed.nfa);
    return { kind: parsed.deterministic ? "dfa" : "nfa", dfa, parsed, model: modelFromParsed(parsed) };
  } catch (e) { throw tag(e, "answer"); }
}


/** too-generous: accepts strings outside L; too-strict: rejects strings in L; both: does both. */
export type Verdict = "correct" | "too-generous" | "too-strict" | "both";

/** State count of a correct DFA answer against the minimum. */
export interface StateReport {
  /** states the student wrote */
  written: number;
  /** a DFA with missing moves implicitly has one more, rejecting, dead state */
  impliedDead: boolean;
  /** written + implied dead state */
  total: number;
  /** states in the minimal DFA */
  min: number;
  /** groups of states that behave identically (names; the implied dead state is null) */
  mergeable: (string | null)[][];
  /** written states never reached from the start */
  unreachable: string[];
}

/** Wrong DFA only: u and v reach the same state, but the suffix z sends exactly one of them into L. */
export interface ConflatedStrings {
  u: string;
  v: string;
  z: string;
  uIn: boolean;
  vIn: boolean;
  /** the student's state both strings reach (index into model.names); null for the implied dead state */
  studentState: number | null;
  stateName: string | null;
}

/** Everything the verdict panel shows about a checked answer. */
export interface Feedback {
  verdict: Verdict;
  correct: boolean;
  /** shortest string wrongly accepted */
  extra: string | null;
  /** shortest string wrongly rejected */
  missing: string | null;
  minStates: number;
  /** wrong DFA only */
  conflated: ConflatedStrings | null;
  /** correct DFA only */
  states: StateReport | null;
  /** answer was nondeterministic and checked as an NFA */
  nfa: boolean;
  /** DFA with missing moves: [state, symbol] pairs, treated as rejecting */
  missingMoves: [string, string][];
}

type AutomatonAnswer = Extract<Answer, { parsed: ParsedAutomaton }>;

/** Name of a subset-construction state in terms of the student's states; null for the empty (dead) set. */
function subsetName(ans: AutomatonAnswer, s: number): string | null {
  const set = ans.dfa.labels![s];
  return set.length ? set.map((i) => ans.parsed.names[i]).join(",") : null;
}

/**
 * Checks an answer against the language. The confused-strings explanation is only given for DFAs:
 * for an NFA or regex the shared state would be a construction artefact, not something the student wrote.
 */
export function checkAnswer(ans: Answer, lang: Language): Feedback {
  const res = compare(ans.dfa, lang.dfa);
  const p = ans.kind === "regex" ? null : ans.parsed;
  const fb: Feedback = {
    verdict: res.correct ? "correct" : res.extra !== null && res.missing !== null ? "both" : res.extra !== null ? "too-generous" : "too-strict",
    correct: res.correct,
    extra: res.extra,
    missing: res.missing,
    minStates: res.minStates,
    conflated: null,
    states: null,
    nfa: ans.kind === "nfa",
    missingMoves: p && p.deterministic ? p.missing : [],
  };

  if (!res.correct && ans.kind === "dfa" && res.conflated) {
    const { u, v, z, uIn, vIn, sharedState: state } = res.conflated;
    // for a DFA every subset has at most one state; the empty set is the implied dead state
    fb.conflated = { u, v, z, uIn, vIn, studentState: ans.dfa.labels![state][0] ?? null, stateName: subsetName(ans, state) };
  }

  if (res.correct && ans.kind === "dfa") {
    const p = ans.parsed;
    const impliedDead = p.missing.length > 0;
    const written = p.nfa.n;
    const total = written + (impliedDead ? 1 : 0);
    const { classOf } = minimize(ans.dfa);
    const groups = new Map<number, (string | null)[]>();
    classOf.forEach((c, i) => {
      if (c < 0) return;
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c)!.push(subsetName(ans, i));
    });
    // the subset construction only creates reachable subsets, so their members are the reachable states
    const reachable = new Set(ans.dfa.labels!.flat());
    fb.states = {
      written, impliedDead, total, min: res.minStates,
      mergeable: total > res.minStates ? [...groups.values()].filter((g) => g.length > 1) : [],
      unreachable: p.names.filter((_, i) => !reachable.has(i)),
    };
  }
  return fb;
}


/** One step of a string's path through the student's automaton. */
export interface ProbeStep {
  /** student's states active at this point (indices into model.names); empty when stuck */
  states: number[];
  /** symbol read to get here (null for the start) */
  symbol: string | null;
}

/** The result of "Try a string". */
export interface Probe {
  /** the string as tested (spaces and ε removed) */
  input: string;
  /** first symbol outside the alphabet, if any */
  foreign: string | null;
  inLanguage: boolean;
  /** null when there is no answer yet */
  accepted: boolean | null;
  /** path through the student's automaton; null for regex answers */
  path: ProbeStep[] | null;
}

/** Runs a string against the language and, when there is a checked answer, through the answer. Spaces and ε are ignored. */
export function probe(raw: string, lang: Language, ans: Answer | null): Probe {
  const input = raw.replace(/\s+/g, "").replace(/[εϵλ]/g, "");
  const foreign = [...input].find((c) => !lang.alphabet.includes(c)) ?? null;
  if (foreign) return { input, foreign, inLanguage: false, accepted: null, path: null };
  const out: Probe = { input, foreign: null, inLanguage: accepts(lang.dfa, input), accepted: null, path: null };
  if (!ans) return out;
  out.accepted = accepts(ans.dfa, input);
  if (ans.kind !== "regex") {
    const visited = trace(ans.dfa, input)!;
    out.path = visited.map((s, i) => ({ states: ans.dfa.labels![s], symbol: i ? input[i - 1] : null }));
  }
  return out;
}


/** A diagram model of a DFA with states named q0, q1, … */
export function modelFromDfa(d: DFA): AutomatonModel {
  return {
    names: d.accept.map((_, i) => "q" + i),
    start: d.start,
    accept: [...d.accept],
    edges: mergeEdges(d.delta.flatMap((row, s) => row.map((t, c) => ({ from: s, to: t, sym: d.alphabet[c] })))),
  };
}

/** A diagram model of the student's automaton, with the student's state names. */
export function modelFromParsed(p: ParsedAutomaton): AutomatonModel {
  return {
    names: [...p.names],
    start: p.nfa.start,
    accept: p.names.map((_, i) => p.nfa.accept.has(i)),
    edges: mergeEdges(p.edges),
  };
}

function mergeEdges(list: { from: number; to: number; sym: string }[]): AutomatonModel["edges"] {
  const byPair = new Map<string, { from: number; to: number; symbols: string[] }>();
  for (const e of list) {
    const k = e.from + ">" + e.to;
    if (!byPair.has(k)) byPair.set(k, { from: e.from, to: e.to, symbols: [] });
    const g = byPair.get(k)!;
    if (!g.symbols.includes(e.sym)) g.symbols.push(e.sym);
  }
  return [...byPair.values()];
}


/** Which input an error belongs to, so it can be shown next to that field. */
export type Field = "alphabet" | "language" | "answer";

/** An engine error as display data. from/to are a character range in the input; line is 1-based. */
export interface InputError {
  field: Field;
  message: string;
  from?: number;
  to?: number;
  line?: number;
}

/** Marks an error with the input it came from; non-engine errors are wrapped so callers see one type. */
function tag(e: unknown, field: Field): EngineError & { field: Field } {
  const err = (e instanceof EngineError ? e : new EngineError(e instanceof Error ? e.message : String(e))) as EngineError & { field: Field };
  err.field = field;
  return err;
}

/** Turn anything thrown by readLanguage/readAnswer into display data. */
export function toInputError(e: unknown, fallback: Field): InputError {
  const err = e as Partial<EngineError> & { field?: Field; message?: string };
  return { field: err.field ?? fallback, message: err.message ?? String(e), from: err.from, to: err.to, line: err.line };
}
