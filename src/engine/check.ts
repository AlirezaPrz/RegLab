/**
 * The study layer over the engine: turns what the student typed into what the UI shows, as plain
 * data (verdicts, counterexamples, hints, traces, diagram models). No automata logic lives in components.
 */
import {
  type DFA, type NFA, type ParsedAutomaton, type Remember,
  EPS, regexToDfa, regexToNfa, parseRegex, parseSpec, explainSpec, parseAutomaton, readAutomatonLines, nfaToDfa, compare, minimize,
  dfaToRegex, nfaToRegex, accepts, trace, accessStrings, sampleStrings, parseAlphabet, EngineError,
} from "./engine.ts";


/** The language answers are checked against, given by a description. */
export interface Language {
  alphabet: string[];
  /** its minimal DFA */
  dfa: DFA;
  /** the description as typed */
  text: string;
}

/** Throws an EngineError whose `field` names the input at fault. */
export function readLanguage(alphabetSrc: string, src: string): Language {
  const alphabet = readAlphabet(alphabetSrc);
  try { return { alphabet, dfa: parseSpec(src, alphabet), text: src }; }
  catch (e) { throw tag(e, "language"); }
}

function readAlphabet(src: string): string[] {
  try { return parseAlphabet(src); } catch (e) { throw tag(e, "alphabet"); }
}

/** The shortest strings in and not in a language. */
export interface Samples { yes: string[]; no: string[] }

const samplesOf = (d: DFA, limit = 7): Samples => ({ yes: sampleStrings(d, true, limit), no: sampleStrings(d, false, limit) });

/** Samples of the language, so the student can check the description says what they meant. */
export function samples(lang: Language, limit = 7): Samples {
  return samplesOf(lang.dfa, limit);
}

/** A state of the hints' DFA, with what it means. */
export interface StateNote {
  name: string;
  /** what is true of w exactly when the DFA is here, in description notation; null for a sink with no short form */
  says: string | null;
  sink: "dead" | "all" | null;
  start: boolean;
  accepting: boolean;
  /** a shortest string that leads to it */
  example: string;
}

/** The hints, in opening order: what to remember, the states, the solution (DFA and regex), the smallest DFA. */
export interface Hints {
  remember: Remember[];
  /** built from what the description tracks (see explainSpec) */
  dfa: AutomatonModel;
  states: StateNote[];
  /** states p0, p1, …; merged[i] lists the states of `dfa` that p_i stands for */
  smallest: AutomatonModel;
  merged: string[][];
  regex: string;
}

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

/** For each state of a minimal DFA, the names of the states it merges. */
function mergedNames(n: number, classOf: number[], names: string[]): string[][] {
  return Array.from({ length: n }, (_, i) => names.filter((_, s) => classOf[s] === i));
}


/** A regex, or a DFA/NFA written as transitions. */
export type AnswerSource = "regex" | "automaton";

/** An automaton ready to draw. */
export interface AutomatonModel {
  names: string[];
  start: number;
  accept: boolean[];
  /** one per (from, to) pair, symbols merged */
  edges: { from: number; to: number; symbols: string[] }[];
}

/**
 * A parsed answer with a total DFA for its language. Automaton answers keep the student's states;
 * their DFA is the subset construction, labelled by sets of those states.
 */
export type Answer =
  | { kind: "regex"; dfa: DFA }
  | { kind: "dfa" | "nfa"; dfa: DFA<number[]>; parsed: ParsedAutomaton; model: AutomatonModel };

/** A nondeterministic automaton is checked as an NFA. Throws an EngineError tagged "answer". */
export function readAnswer(source: AnswerSource, src: string, alphabet: string[]): Answer {
  try {
    if (source === "regex") return { kind: "regex", dfa: regexToDfa(src, alphabet) };
    const parsed = parseAutomaton(src, alphabet);
    const dfa = nfaToDfa(parsed.nfa);
    return { kind: parsed.deterministic ? "dfa" : "nfa", dfa, parsed, model: modelFromParsed(parsed) };
  } catch (e) { throw tag(e, "answer"); }
}


/** too-generous accepts strings outside L; too-strict rejects strings in L. */
export type Verdict = "correct" | "too-generous" | "too-strict" | "both";

/** A correct DFA's states against the minimum. */
export interface StateReport {
  written: number;
  /** missing moves imply one more, rejecting, state */
  impliedDead: boolean;
  total: number;
  min: number;
  /** groups of equivalent states, by name; null is the implied dead state */
  mergeable: (string | null)[][];
  unreachable: string[];
}

/** u and v reach the same state of a wrong DFA, but z sends exactly one of them into L. */
export interface ConflatedStrings {
  u: string;
  v: string;
  z: string;
  uIn: boolean;
  vIn: boolean;
  /** index into model.names; null for the implied dead state */
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
  /** wrong DFA only */
  conflated: ConflatedStrings | null;
  /** correct DFA only */
  states: StateReport | null;
  nfa: boolean;
  /** [state, symbol] pairs with no move, treated as rejecting */
  missingMoves: [string, string][];
}

type AutomatonAnswer = Extract<Answer, { parsed: ParsedAutomaton }>;

/** A subset-construction state named by the student's states; null for the empty set. */
function subsetName(ans: AutomatonAnswer, s: number): string | null {
  const set = ans.dfa.labels![s];
  return set.length ? set.map((i) => ans.parsed.names[i]).join(",") : null;
}

/**
 * Conflated strings are only reported for DFAs: for an NFA or regex the shared state would be a
 * construction artefact, not something the student wrote.
 */
export function checkAnswer(ans: Answer, lang: Language): Feedback {
  const res = compare(ans.dfa, lang.dfa);
  const p = ans.kind === "regex" ? null : ans.parsed;
  const fb: Feedback = {
    verdict: res.correct ? "correct" : res.extra !== null && res.missing !== null ? "both" : res.extra !== null ? "too-generous" : "too-strict",
    correct: res.correct,
    extra: res.extra,
    missing: res.missing,
    conflated: null,
    states: null,
    nfa: ans.kind === "nfa",
    missingMoves: p && p.deterministic ? p.missing : [],
  };

  if (!res.correct && ans.kind === "dfa" && res.conflated) {
    const { u, v, z, uIn, vIn, sharedState: state } = res.conflated;
    // a DFA's subsets hold at most one state; the empty set is the implied dead state
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
    // the subset construction only builds reachable subsets
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
  /** active states (indices into model.names); empty when stuck */
  states: number[];
  /** null for the start */
  symbol: string | null;
}

/** The result of "Try a string". */
export interface Probe {
  /** spaces and ε removed */
  input: string;
  /** first symbol outside the alphabet */
  foreign: string | null;
  inLanguage: boolean;
  /** null until there is a checked answer */
  accepted: boolean | null;
  /** null for regex answers */
  path: ProbeStep[] | null;
}

/** Runs a string against the language and, once checked, through the answer. */
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


function modelFromDfa(d: DFA, names = d.accept.map((_, i) => "q" + i)): AutomatonModel {
  return {
    names,
    start: d.start,
    accept: [...d.accept],
    edges: mergeEdges(d.delta.flatMap((row, s) => row.map((t, c) => ({ from: s, to: t, sym: d.alphabet[c] })))),
  };
}

function modelFromParsed(p: ParsedAutomaton): AutomatonModel {
  return {
    names: [...p.names],
    start: p.nfa.start,
    accept: p.names.map((_, i) => p.nfa.accept.has(i)),
    edges: mergeEdges(p.edges),
  };
}

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


/** Regex → automata. */
export interface RegexConversion {
  /** built by induction on the regex (see regexToNfa) */
  nfa: AutomatonModel;
  /** the subset construction on it: states A, B, …, and ∅ for the empty set */
  dfa: AutomatonModel;
  /** the NFA states behind each DFA state */
  subsets: string[][];
  /** merged[i] lists the DFA states that minimal state i stands for */
  minimal: AutomatonModel;
  merged: string[][];
  samples: Samples;
}

export function convertRegex(alphabetSrc: string, src: string): RegexConversion {
  const alphabet = readAlphabet(alphabetSrc);
  try {
    const nfa = regexToNfa(parseRegex(src, alphabet), alphabet);
    const nfaNames = Array.from({ length: nfa.n }, (_, i) => "q" + i);
    const dfa = nfaToDfa(nfa);
    const subsets = dfa.labels!.map((set) => set.map((i) => nfaNames[i]));
    const dfaNames = subsetNames(subsets);
    const { dfa: min, classOf } = minimize(dfa);
    return {
      nfa: modelFromNfa(nfa, nfaNames),
      dfa: modelFromDfa(dfa, dfaNames),
      subsets,
      minimal: modelFromDfa(min),
      merged: mergedNames(min.n, classOf, dfaNames),
      samples: samplesOf(min),
    };
  } catch (e) { throw tag(e, "input"); }
}

/** A … Z, AA, AB, … in build order, and ∅ for the empty set. */
function subsetNames(subsets: string[][]): string[] {
  let k = 0;
  const letters = (i: number): string => (i < 26 ? "" : letters(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26));
  return subsets.map((set) => (set.length ? letters(k++) : "∅"));
}

/** Automaton → regex. */
export interface AutomatonConversion {
  model: AutomatonModel;
  kind: "dfa" | "nfa";
  regex: string;
  /** whichever gave the shorter regex: the automaton as written, or its smallest DFA */
  eliminatedFrom: "automaton" | "smallest";
  /** states in the smallest DFA */
  minStates: number;
  samples: Samples;
}

export function convertAutomaton(alphabetSrc: string, src: string): AutomatonConversion {
  const alphabet = readAlphabet(alphabetSrc);
  try {
    const parsed = parseAutomaton(src, alphabet);
    const min = minimize(nfaToDfa(parsed.nfa)).dfa;
    // the student's own automaton gives a regex that follows it; ties go to it
    const own = nfaToRegex(parsed.nfa), small = dfaToRegex(min);
    return {
      model: modelFromParsed(parsed),
      kind: parsed.deterministic ? "dfa" : "nfa",
      regex: small.length < own.length ? small : own,
      eliminatedFrom: small.length < own.length ? "smallest" : "automaton",
      minStates: min.n,
      samples: samplesOf(min),
    };
  } catch (e) { throw tag(e, "input"); }
}

/** The transition format parseAutomaton reads. States with no moves are dropped unless they are the start. */
export function automatonText(m: AutomatonModel): string {
  const used = new Set([m.start]);
  for (const e of m.edges) { used.add(e.from); used.add(e.to); }
  return [
    `start: ${m.names[m.start]}`,
    `accept: ${m.names.filter((_, i) => m.accept[i] && used.has(i)).join(" ")}`,
    ...m.edges.map((e) => `${m.names[e.from]} ${e.symbols.join(",")} ${m.names[e.to]}`),
  ].join("\n");
}


/** An automaton as far as it has been typed. */
export interface Draft {
  /** null until there is a start line */
  model: AutomatonModel | null;
  kind: "dfa" | "nfa";
  /** 1-based lines that can't be read yet */
  skipped: number[];
}

/**
 * Reads an automaton forgivingly: unreadable lines are skipped and accept-only states still drawn.
 * Complete text is numbered as parseAutomaton numbers it, so the drawing matches the checked answer.
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


/** The input an error belongs to; "input" is the converter's regex or automaton. */
export type Field = "alphabet" | "language" | "answer" | "input";

/** An engine error as display data (see EngineError for the positions). */
export interface InputError {
  field: Field;
  message: string;
  from?: number;
  to?: number;
  line?: number;
}

/** Tags an error with its input, wrapping non-engine errors so callers see one type. */
function tag(e: unknown, field: Field): EngineError & { field: Field } {
  const err = (e instanceof EngineError ? e : new EngineError(e instanceof Error ? e.message : String(e))) as EngineError & { field: Field };
  err.field = field;
  return err;
}

/** Anything thrown by readLanguage, readAnswer or the converters, as display data. */
export function toInputError(e: unknown, fallback: Field): InputError {
  const err = e as Partial<EngineError> & { field?: Field; message?: string };
  return { field: err.field ?? fallback, message: err.message ?? String(e), from: err.from, to: err.to, line: err.line };
}
