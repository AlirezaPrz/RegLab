/**
 * The study-session layer over the engine: turns what the student typed into everything the UI
 * shows, as plain data (verdicts, counterexamples, hints, traces, diagram models). Components
 * only render these results; no automata logic lives in them.
 */
import {
  type DFA, type NFA, type ParsedAutomaton, type Remember,
  EPS, regexToDfa, regexToNfa, parseRegex, parseSpec, explainSpec, parseAutomaton, readAutomatonLines, nfaToDfa, compare, minimize,
  dfaToRegex, nfaToRegex, accepts, trace, accessStrings, sampleStrings, parseAlphabet, EngineError,
} from "./engine.ts";


/** The reference language, given by a description, ready to check answers against. */
export interface Language {
  alphabet: string[];
  /** its minimal DFA */
  dfa: DFA;
  /** the description as typed */
  text: string;
}

/** Reads the alphabet and the description of the language. Throws EngineError with `field` naming the input that is wrong. */
export function readLanguage(alphabetSrc: string, src: string): Language {
  const alphabet = readAlphabet(alphabetSrc);
  try { return { alphabet, dfa: parseSpec(src, alphabet), text: src }; }
  catch (e) { throw tag(e, "language"); }
}

function readAlphabet(src: string): string[] {
  try { return parseAlphabet(src); } catch (e) { throw tag(e, "alphabet"); }
}

/** The shortest strings in and not in the language, for the student to sanity-check their description. */
export function samples(lang: Language, limit = 7): { yes: string[]; no: string[] } {
  return { yes: sampleStrings(lang.dfa, true, limit), no: sampleStrings(lang.dfa, false, limit) };
}

/** A state of the DFA in the hints, with what it means. */
export interface StateNote {
  name: string;
  /**
   * What is true of w exactly when the DFA is in this state after reading w, in description
   * notation. null for a merged state with no short description (dead: no extension of w is in L;
   * all: every extension is).
   */
  says: string | null;
  sink: "dead" | "all" | null;
  start: boolean;
  accepting: boolean;
  /** a shortest string that leads to it */
  example: string;
}

/**
 * The hints, in the order they open: what a DFA for the language has to remember; its states and
 * what each means; the DFA itself with a regular expression (the full solution); and the smallest
 * DFA, with the states it merges.
 */
export interface Hints {
  remember: Remember[];
  /** the DFA built from what the description keeps track of (see explainSpec) */
  dfa: AutomatonModel;
  states: StateNote[];
  /** the smallest DFA, states p0, p1, …; merged[i] lists the states of `dfa` that p_i stands for */
  smallest: AutomatonModel;
  merged: string[][];
  /** a regular expression for the language, built from the DFA by state elimination */
  regex: string;
}

/** The hints for a language. */
export function hints(lang: Language): Hints {
  const ex = explainSpec(lang.text, lang.alphabet);
  const { dfa: min, classOf } = minimize(ex.dfa);
  const examples = accessStrings(ex.dfa);
  return {
    remember: ex.remember,
    dfa: modelFromDfa(ex.dfa, ex.names),
    states: ex.names.map((name, s) => ({
      name, says: ex.says[s], sink: ex.sink[s], start: s === ex.dfa.start, accepting: ex.dfa.accept[s], example: examples[s] ?? "",
    })),
    smallest: modelFromDfa(min, min.accept.map((_, i) => "p" + i)),
    merged: mergedNames(min.n, classOf, ex.names),
    regex: dfaToRegex(lang.dfa),
  };
}

/** For each state of a minimal DFA, the names of the states it merges (classOf maps old states to new ones). */
function mergedNames(n: number, classOf: number[], names: string[]): string[][] {
  return Array.from({ length: n }, (_, i) => names.filter((_, s) => classOf[s] === i));
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


/** A diagram model of a DFA, with states named q0, q1, … unless `names` are given. */
export function modelFromDfa(d: DFA, names = d.accept.map((_, i) => "q" + i)): AutomatonModel {
  return {
    names,
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

/** A diagram model of an NFA, ε-moves included. */
function modelFromNfa(nfa: NFA, names: string[]): AutomatonModel {
  const list: { from: number; to: number; sym: string }[] = [];
  for (let s = 0; s < nfa.n; s++) {
    for (const [sym, targets] of nfa.trans[s]) for (const to of targets) list.push({ from: s, to, sym });
    for (const to of nfa.eps[s]) list.push({ from: s, to, sym: EPS });
  }
  return { names, start: nfa.start, accept: names.map((_, i) => nfa.accept.has(i)), edges: mergeEdges(list) };
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


/** What the regex → automata converter shows. */
export interface RegexConversion {
  /** the NFA built from the regex by induction on its structure (see regexToNfa), states q0, q1, … */
  nfa: AutomatonModel;
  /** the subset construction applied to that NFA, states A, B, … and ∅ for the empty set */
  dfa: AutomatonModel;
  /** subsets[i]: the NFA states that DFA state i stands for (empty for ∅) */
  subsets: string[][];
  /** the smallest DFA, states q0, q1, … */
  minimal: AutomatonModel;
  samples: { yes: string[]; no: string[] };
}

/** Converts a regular expression into an NFA, the DFA the subset construction makes from it, and the smallest DFA. */
export function convertRegex(alphabetSrc: string, src: string): RegexConversion {
  const alphabet = readAlphabet(alphabetSrc);
  try {
    const nfa = regexToNfa(parseRegex(src, alphabet), alphabet);
    const nfaNames = Array.from({ length: nfa.n }, (_, i) => "q" + i);
    const dfa = nfaToDfa(nfa);
    const subsets = dfa.labels!.map((set) => set.map((i) => nfaNames[i]));
    const min = minimize(dfa).dfa;
    return {
      nfa: modelFromNfa(nfa, nfaNames),
      dfa: modelFromDfa(dfa, subsetNames(subsets)),
      subsets,
      minimal: modelFromDfa(min),
      samples: { yes: sampleStrings(min, true, 7), no: sampleStrings(min, false, 7) },
    };
  } catch (e) { throw tag(e, "input"); }
}

/** Letters for the subset-construction states, in the order they were built (A … Z, then AA, AB, …), and ∅ for the empty set. */
function subsetNames(subsets: string[][]): string[] {
  let k = 0;
  const letters = (i: number): string => (i < 26 ? "" : letters(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26));
  return subsets.map((set) => (set.length ? letters(k++) : "∅"));
}

/** What the automaton → regex converter shows. */
export interface AutomatonConversion {
  /** the automaton as written */
  model: AutomatonModel;
  /** "nfa" when it has ε-moves or more than one move on a symbol */
  kind: "dfa" | "nfa";
  /** a regular expression for its language, by state elimination */
  regex: string;
  /** what the states were eliminated from: the automaton as written, or its smallest DFA when that gave a shorter expression */
  eliminatedFrom: "automaton" | "smallest";
  /** states in the smallest DFA */
  minStates: number;
  samples: { yes: string[]; no: string[] };
}

/** Converts an automaton written as transitions into a regular expression for its language. */
export function convertAutomaton(alphabetSrc: string, src: string): AutomatonConversion {
  const alphabet = readAlphabet(alphabetSrc);
  try {
    const parsed = parseAutomaton(src, alphabet);
    const min = minimize(nfaToDfa(parsed.nfa)).dfa;
    // eliminating from the student's own automaton gives an expression that follows it; the
    // smallest DFA sometimes gives a shorter one. Ties go to the student's automaton.
    const own = nfaToRegex(parsed.nfa), small = dfaToRegex(min);
    return {
      model: modelFromParsed(parsed),
      kind: parsed.deterministic ? "dfa" : "nfa",
      regex: small.length < own.length ? small : own,
      eliminatedFrom: small.length < own.length ? "smallest" : "automaton",
      minStates: min.n,
      samples: { yes: sampleStrings(min, true, 7), no: sampleStrings(min, false, 7) },
    };
  } catch (e) { throw tag(e, "input"); }
}

/**
 * Writes an automaton in the transition format parseAutomaton reads, so a converted automaton
 * can be copied or converted back. States with no moves are left out unless they are the start.
 */
export function automatonText(m: AutomatonModel): string {
  const used = new Set([m.start]);
  for (const e of m.edges) { used.add(e.from); used.add(e.to); }
  return [
    `start: ${m.names[m.start]}`,
    `accept: ${m.names.filter((_, i) => m.accept[i] && used.has(i)).join(" ")}`,
    ...m.edges.map((e) => `${m.names[e.from]} ${e.symbols.join(",")} ${m.names[e.to]}`),
  ].join("\n");
}


/** An automaton as far as it has been written, drawn while the student types. */
export interface Draft {
  /** null until there is a start line */
  model: AutomatonModel | null;
  /** "nfa" once it has an ε-move or two moves on one symbol from one state */
  kind: "dfa" | "nfa";
  /** lines that can't be read yet, left out of the drawing (1-based) */
  skipped: number[];
}

/**
 * Reads an automaton the forgiving way: lines that can't be read yet are skipped, and states named
 * only on the accept line are drawn too. When the text is complete, the states are numbered as
 * parseAutomaton numbers them, so the drawing matches the checked answer.
 */
export function draftAutomaton(src: string, alphabet: readonly string[]): Draft {
  let start: string | null = null;
  const accept = new Set<string>(), moves: { from: string; sym: string; to: string }[] = [], skipped: number[] = [];
  for (const { line, read } of readAutomatonLines(src, alphabet)) {
    if (read.t === "error") skipped.push(line);
    else if (read.t === "start") start = read.name;
    else if (read.t === "accept") read.names.forEach((a) => accept.add(a));
    else for (const sym of read.symbols) moves.push({ from: read.from, sym, to: read.to });
  }
  if (start === null) return { model: null, kind: "dfa", skipped };
  const names: string[] = [], index = new Map<string, number>();
  const id = (name: string) => { if (!index.has(name)) { index.set(name, names.length); names.push(name); } return index.get(name)!; };
  id(start);
  for (const m of moves) { id(m.from); id(m.to); }
  for (const a of accept) id(a);
  const edges = moves.map((m) => ({ from: id(m.from), to: id(m.to), sym: m.sym }));
  const target = new Map<string, number>();
  const nfa = edges.some((e) => {
    if (e.sym === EPS) return true;
    const k = e.from + " " + e.sym;
    if (target.has(k) && target.get(k) !== e.to) return true;
    target.set(k, e.to);
    return false;
  });
  return {
    model: { names, start: 0, accept: names.map((n) => accept.has(n)), edges: mergeEdges(edges) },
    kind: nfa ? "nfa" : "dfa",
    skipped,
  };
}


/** Which input an error belongs to, so it can be shown next to that field. "input" is the converter's regex or automaton. */
export type Field = "alphabet" | "language" | "answer" | "input";

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

/** Turn anything thrown by readLanguage, readAnswer or the converters into display data. */
export function toInputError(e: unknown, fallback: Field): InputError {
  const err = e as Partial<EngineError> & { field?: Field; message?: string };
  return { field: err.field ?? fallback, message: err.message ?? String(e), from: err.from, to: err.to, line: err.line };
}
