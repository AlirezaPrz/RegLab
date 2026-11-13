/**
 * The automata engine: everything RegLab knows about regular languages.
 *
 * Every input becomes a total DFA over a fixed alphabet: a regular expression in course
 * notation (Thompson construction, then subset construction), a language description (one DFA
 * per condition, joined by product construction), or a DFA/NFA written as transitions. DFAs are
 * then minimized (Moore partition refinement), compared, and turned back into explanations.
 *
 * Erasable TypeScript only, with no DOM and no dependencies, so Node runs it directly in the
 * tests and Vite bundles it for the browser.
 */

export const EPS = "ε";
/** Guards against descriptions whose product grows too large to explore in the browser. */
const STATE_LIMIT = 20000;


/**
 * Every error the engine throws for bad input. The message is written for students.
 * Where the problem is in the input:
 *   from/to  character range in the source text (0-based, `to` exclusive)
 *   line     1-based line number (automata)
 */
export class EngineError extends Error {
  from?: number;
  to?: number;
  line?: number;
  constructor(message: string, where: { from?: number; to?: number; line?: number } = {}) {
    super(message);
    this.name = "EngineError";
    if (where.from !== undefined) {
      this.from = where.from;
      this.to = where.to ?? where.from;
    }
    if (where.line !== undefined) this.line = where.line;
  }
}


/** A total DFA: every state has a move on every symbol. States are 0..n-1. */
export interface DFA<L = unknown> {
  alphabet: string[];
  /** number of states */
  n: number;
  start: number;
  /** accept[s] is true when s is an accepting state */
  accept: boolean[];
  /** delta[s][i] is the state reached from s on alphabet[i] */
  delta: number[][];
  /** what each state stands for when the DFA was built from something else (for example, the NFA states of a subset-construction state) */
  labels?: L[];
}

/**
 * Builds an explicit DFA from an implicit machine by breadth-first search from `init`.
 * States are compared by their JSON form, so `step` may return fresh arrays or tuples.
 * Only reachable states are created, and each is numbered the first time it is seen.
 * Throws EngineError past STATE_LIMIT states.
 */
export function dfaFromMachine<S>(
  alphabet: readonly string[],
  init: S,
  step: (s: S, ch: string) => S,
  accept: (s: S) => unknown,
): DFA<S> {
  const key = JSON.stringify;
  const ids = new Map<string, number>([[key(init), 0]]);
  const states: S[] = [init];
  const delta: number[][] = [];
  for (let i = 0; i < states.length; i++) {
    const row: number[] = [];
    for (const ch of alphabet) {
      const t = step(states[i], ch);
      const k = key(t);
      if (!ids.has(k)) {
        if (states.length >= STATE_LIMIT) throw new EngineError("This language needs too many states to handle here.");
        ids.set(k, states.length);
        states.push(t);
      }
      row.push(ids.get(k)!);
    }
    delta.push(row);
  }
  return { alphabet: [...alphabet], n: states.length, start: 0, accept: states.map((s) => !!accept(s)), delta, labels: states };
}

/** The DFA for the complement language. Swapping accepting states is only correct because d is total. */
export function complement<L>(d: DFA<L>): DFA<L> {
  return { ...d, accept: d.accept.map((a) => !a) };
}

/** Product construction over the same alphabet: a pair state accepts when f(a accepts, b accepts). */
export function product(a: DFA, b: DFA, f: (x: boolean, y: boolean) => boolean): DFA<[number, number]> {
  return dfaFromMachine<[number, number]>(
    a.alphabet,
    [a.start, b.start],
    ([p, q], ch) => { const i = a.alphabet.indexOf(ch); return [a.delta[p][i], b.delta[q][i]]; },
    ([p, q]) => f(a.accept[p], b.accept[q]),
  );
}

/**
 * Minimizes d with Moore partition refinement and numbers the result in BFS order (start = 0).
 * Returns the minimal DFA and `classOf`, which maps each state of d to its state in the minimal
 * DFA, or -1 if it is unreachable.
 */
export function minimize(d: DFA): { dfa: DFA<never>; classOf: number[] } {
  const k = d.alphabet.length;
  const reach: boolean[] = new Array(d.n).fill(false);
  const order = [d.start];
  reach[d.start] = true;
  for (let i = 0; i < order.length; i++) for (let c = 0; c < k; c++) {
    const t = d.delta[order[i]][c];
    if (!reach[t]) { reach[t] = true; order.push(t); }
  }
  // Round k groups states that agree on every string of length ≤ k. Groups only ever split,
  // so the first round that does not add a group has reached the fixed point: Myhill–Nerode equivalence.
  let cls: number[] = d.accept.map((a) => (a ? 1 : 0));
  let count = 0;
  for (;;) {
    const sigIds = new Map<string, number>();
    const next: number[] = new Array(d.n).fill(-1);
    for (const s of order) {
      const sig = cls[s] + "|" + d.delta[s].map((t) => cls[t]).join(",");
      if (!sigIds.has(sig)) sigIds.set(sig, sigIds.size);
      next[s] = sigIds.get(sig)!;
    }
    const done = sigIds.size === count;
    count = sigIds.size;
    cls = next;
    if (done) break;
  }
  // any member of a class can stand for it, because equivalent states move to equivalent states
  const rep = new Map<number, number>();
  for (const s of order) if (!rep.has(cls[s])) rep.set(cls[s], s);
  const min = dfaFromMachine<number>(
    d.alphabet,
    cls[d.start],
    (c, ch) => cls[d.delta[rep.get(c)!][d.alphabet.indexOf(ch)]],
    (c) => d.accept[rep.get(c)!],
  );
  const renum = new Map(min.labels!.map((c, i) => [c, i]));
  const classOf = cls.map((c, s) => (reach[s] ? renum.get(c)! : -1));
  delete min.labels;
  return { dfa: min as DFA<never>, classOf };
}

/** Whether d accepts w. A symbol outside the alphabet rejects. */
export function accepts(d: DFA, w: string): boolean {
  let s = d.start;
  for (const ch of w) {
    const i = d.alphabet.indexOf(ch);
    if (i < 0) return false;
    s = d.delta[s][i];
  }
  return d.accept[s];
}

/** States visited while reading w (length |w|+1), or null if w uses a foreign symbol. */
export function trace(d: DFA, w: string): number[] | null {
  const path = [d.start];
  for (const ch of w) {
    const i = d.alphabet.indexOf(ch);
    if (i < 0) return null;
    path.push(d.delta[path[path.length - 1]][i]);
  }
  return path;
}

/** The shortest (then alphabetically first) string reaching each state, by BFS; undefined if unreachable. */
export function accessStrings(d: DFA): (string | undefined)[] {
  const acc: (string | undefined)[] = new Array(d.n);
  acc[d.start] = "";
  const q = [d.start];
  for (let i = 0; i < q.length; i++) d.alphabet.forEach((ch, c) => {
    const t = d.delta[q[i]][c];
    if (acc[t] === undefined) { acc[t] = acc[q[i]] + ch; q.push(t); }
  });
  return acc;
}

/** BFS over state pairs for the shortest w with pred(a accepts w, b accepts w); null if none exists. */
export function witness(a: DFA, b: DFA, pred: (x: boolean, y: boolean) => boolean): string | null {
  const seen = new Set([a.start + "," + b.start]);
  const q: [number, number, string][] = [[a.start, b.start, ""]];
  for (let i = 0; i < q.length; i++) {
    const [p, r, w] = q[i];
    if (pred(a.accept[p], b.accept[r])) return w;
    a.alphabet.forEach((ch, c) => {
      const p2 = a.delta[p][c], r2 = b.delta[r][c], key = p2 + "," + r2;
      if (!seen.has(key)) { seen.add(key); q.push([p2, r2, w + ch]); }
    });
  }
  return null;
}

/** For each state, whether some state with accept === want can be reached from it. */
function canReach(d: DFA, want: boolean): boolean[] {
  const live = d.accept.map((a) => a === want);
  for (let changed = true; changed;) {
    changed = false;
    for (let s = 0; s < d.n; s++) if (!live[s] && d.delta[s].some((t) => live[t])) { live[s] = true; changed = true; }
  }
  return live;
}

/**
 * The first `limit` strings, shortest first, that d accepts (want = true) or rejects (want = false).
 * The BFS only enters states that can still reach a wanted state, so it never wanders into a dead end.
 */
export function sampleStrings(d: DFA, want: boolean, limit: number): string[] {
  const live = canReach(d, want);
  const out: string[] = [];
  if (!live[d.start]) return out;
  const q: [number, string][] = [[d.start, ""]];
  for (let i = 0; i < q.length && out.length < limit && i < 50000; i++) { // the cap bounds sparse languages
    const [s, w] = q[i];
    if (d.accept[s] === want) out.push(w);
    d.alphabet.forEach((ch, c) => { const t = d.delta[s][c]; if (live[t]) q.push([t, w + ch]); });
  }
  return out;
}


/** An NFA with ε-moves. States are 0..n-1; a symbol with no entry in trans has no move. */
export interface NFA {
  alphabet: string[];
  n: number;
  start: number;
  accept: Set<number>;
  /** trans[s].get(ch) is the set of states reached from s on ch */
  trans: Map<string, Set<number>>[];
  /** eps[s] is the set of states reached from s by one ε-move */
  eps: Set<number>[];
  /** adds a state and returns its number */
  add(): number;
  /** adds a move; ch may be ε */
  edge(from: number, ch: string, to: number): void;
}

/** An empty NFA over the alphabet, to be filled with add() and edge(). */
export function newNfa(alphabet: readonly string[]): NFA {
  const nfa: NFA = {
    alphabet: [...alphabet], n: 0, start: 0, accept: new Set(), trans: [], eps: [],
    add: () => { nfa.trans.push(new Map()); nfa.eps.push(new Set()); return nfa.n++; },
    edge: (from, ch, to) => {
      if (ch === EPS) nfa.eps[from].add(to);
      else { if (!nfa.trans[from].has(ch)) nfa.trans[from].set(ch, new Set()); nfa.trans[from].get(ch)!.add(to); }
    },
  };
  return nfa;
}

/** The ε-closure of a set of states, sorted so equal sets compare equal in dfaFromMachine. */
function closure(nfa: NFA, set: Iterable<number>): number[] {
  const out = new Set(set), stack = [...out];
  while (stack.length) for (const t of nfa.eps[stack.pop()!]) if (!out.has(t)) { out.add(t); stack.push(t); }
  return [...out].sort((x, y) => x - y);
}

/**
 * Subset construction. labels[i] is the set of NFA states that DFA state i stands for.
 * A missing move leads to the empty set, a rejecting state with no way out. That is why
 * missing DFA transitions count as rejecting.
 */
export function nfaToDfa(nfa: NFA): DFA<number[]> {
  return dfaFromMachine<number[]>(
    nfa.alphabet,
    closure(nfa, [nfa.start]),
    (S, ch) => {
      const next = new Set<number>();
      for (const s of S) for (const t of nfa.trans[s].get(ch) || []) next.add(t);
      return closure(nfa, next);
    },
    (S) => S.some((s) => nfa.accept.has(s)),
  );
}


/** Parse tree of a course-notation regular expression. */
export type RegexAst =
  | { t: "eps" }
  | { t: "empty" }
  | { t: "sym"; c: string }
  | { t: "union"; a: RegexAst; b: RegexAst }
  | { t: "concat"; a: RegexAst; b: RegexAst }
  | { t: "star"; a: RegexAst };

/**
 * Parses a course-notation regular expression by recursive descent: union (+, | or ∪) binds
 * loosest, then concatenation, then *. ε (also ϵ, λ) is the empty string and ∅ the empty set.
 * Throws EngineError whose from/to point into `src` as typed, spaces included.
 */
export function parseRegex(src: string, alphabet: readonly string[]): RegexAst {
  // the parser reads src without whitespace; srcAt maps back to where the student typed it
  const srcAt: number[] = [];
  let s = "";
  for (let i = 0; i < src.length; i++) if (!/\s/.test(src[i])) { s += src[i]; srcAt.push(i); }
  srcAt.push(src.length);
  let pos = 0;
  const col = (p: number) => srcAt[Math.min(p, s.length)] + 1;
  const fail = (msg: string): never => {
    const from = srcAt[Math.min(pos, s.length)];
    throw new EngineError(msg, { from, to: pos < s.length ? from + 1 : from });
  };
  const isUnion = (c: string) => c === "+" || c === "|" || c === "∪";
  function union(): RegexAst {
    let node = concat();
    while (pos < s.length && isUnion(s[pos])) { pos++; node = { t: "union", a: node, b: concat() }; }
    return node;
  }
  function concat(): RegexAst {
    const parts: RegexAst[] = [];
    while (pos < s.length && s[pos] !== ")" && !isUnion(s[pos])) parts.push(star());
    if (!parts.length) fail(pos >= s.length ? "The expression ends where a symbol was expected." : `Unexpected "${s[pos]}" at position ${col(pos)}.`);
    return parts.reduce((a, b) => ({ t: "concat", a, b }));
  }
  function star(): RegexAst {
    let node = atom();
    while (s[pos] === "*") { pos++; node = { t: "star", a: node }; }
    return node;
  }
  function atom(): RegexAst {
    const c = s[pos];
    if (c === "(") {
      pos++;
      const node = union();
      if (s[pos] !== ")") fail("Missing closing parenthesis.");
      pos++;
      return node;
    }
    if (c === "*") fail(`"*" at position ${col(pos)} has nothing to repeat.`);
    pos++;
    if (c === EPS || c === "ϵ" || c === "λ") return { t: "eps" };
    if (c === "∅") return { t: "empty" };
    if (!alphabet.includes(c)) { pos--; fail(`"${c}" is not in the alphabet {${alphabet.join(", ")}}. Use ε for the empty string.`); }
    return { t: "sym", c };
  }
  if (!s.length) fail("Enter a regular expression.");
  const ast = union();
  if (pos < s.length) fail(`Unexpected "${s[pos]}" at position ${col(pos)}.`);
  return ast;
}

/** Thompson construction: each node becomes an NFA fragment with one entry and one exit state. */
export function regexToNfa(ast: RegexAst, alphabet: readonly string[]): NFA {
  const nfa = newNfa(alphabet);
  function build(node: RegexAst): [number, number] {
    const i = nfa.add(), f = nfa.add();
    if (node.t === "eps") nfa.edge(i, EPS, f);
    else if (node.t === "sym") nfa.edge(i, node.c, f);
    else if (node.t === "union") for (const part of [build(node.a), build(node.b)]) { nfa.edge(i, EPS, part[0]); nfa.edge(part[1], EPS, f); }
    else if (node.t === "concat") { const a = build(node.a), b = build(node.b); nfa.edge(i, EPS, a[0]); nfa.edge(a[1], EPS, b[0]); nfa.edge(b[1], EPS, f); }
    else if (node.t === "star") { const a = build(node.a); nfa.edge(i, EPS, f); nfa.edge(i, EPS, a[0]); nfa.edge(a[1], EPS, a[0]); nfa.edge(a[1], EPS, f); }
    // ∅ gets no edges, so its exit is unreachable
    return [i, f];
  }
  const [i, f] = build(ast);
  nfa.start = i;
  nfa.accept.add(f);
  return nfa;
}

/** The minimal DFA of a regular expression. Throws EngineError for bad input. */
export function regexToDfa(src: string, alphabet: readonly string[]): DFA<never> {
  return minimize(nfaToDfa(regexToNfa(parseRegex(src, alphabet), alphabet))).dfa;
}


/** A student's automaton as written, with states numbered in order of first appearance (start first). */
export interface ParsedAutomaton {
  nfa: NFA;
  /** names[i] is the name the student gave state i */
  names: string[];
  /** no ε-moves and at most one move per state and symbol */
  deterministic: boolean;
  /** [state name, symbol] pairs with no move */
  missing: [string, string][];
  /** one entry per transition symbol, as written */
  edges: { from: number; to: number; sym: string }[];
}

/**
 * Parses an automaton written one line at a time; // and % start comments:
 *     start: q0
 *     accept: q1 q2
 *     q0 a q1
 *     q0 a,b q0        (several symbols at once)
 *     q1 ε q2          (makes it an NFA)
 * Throws EngineError; errors about one line carry `line`.
 */
export function parseAutomaton(src: string, alphabet: readonly string[]): ParsedAutomaton {
  const names: string[] = [], index = new Map<string, number>();
  const id = (name: string) => { if (!index.has(name)) { index.set(name, names.length); names.push(name); } return index.get(name)!; };
  let start: string | null = null;
  const accept: string[] = [], acceptLine = new Map<string, number>();
  const edges: { from: string; sym: string; to: string }[] = [];
  src.split("\n").forEach((raw, ln) => {
    const line = raw.replace(/(\/\/|%).*$/, "").trim();
    if (!line) return;
    const where = `Line ${ln + 1}: `;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(start|initial)\s*[:=]\s*(\S+)$/i))) { start = m[2]; return; }
    if ((m = line.match(/^(accept|accepting|final)\s*[:=]\s*(.*)$/i))) {
      const list = m[2].split(/[\s,]+/).filter(Boolean);
      for (const a of list) if (!acceptLine.has(a)) acceptLine.set(a, ln + 1);
      accept.push(...list);
      return;
    }
    const parts = line.replace(/->|→/g, " ").split(/\s+/);
    if (parts.length !== 3) throw new EngineError(where + `expected "state symbol state", for example "q0 a q1".`, { line: ln + 1 });
    const [from, syms, to] = parts;
    for (let sym of syms.split(",").filter(Boolean)) {
      if (/^(eps|epsilon|ϵ|λ)$/i.test(sym)) sym = EPS;
      if (sym !== EPS && !alphabet.includes(sym)) throw new EngineError(where + `"${sym}" is not in the alphabet {${alphabet.join(", ")}}.`, { line: ln + 1 });
      edges.push({ from, sym, to });
    }
  });
  if (!edges.length && start === null) throw new EngineError("Enter your automaton: a start line, an accept line, and one transition per line.");
  if (start === null) throw new EngineError(`Say which state is the start state, for example "start: q0".`);
  id(start);
  for (const e of edges) { id(e.from); id(e.to); }
  for (const a of accept) if (!index.has(a)) throw new EngineError(`Accepting state "${a}" does not appear in any transition.`, { line: acceptLine.get(a) });

  const nfa = newNfa(alphabet);
  names.forEach(() => nfa.add());
  nfa.start = index.get(start)!;
  accept.forEach((a) => nfa.accept.add(index.get(a)!));
  edges.forEach((e) => nfa.edge(index.get(e.from)!, e.sym, index.get(e.to)!));

  let deterministic = true;
  const missing: [string, string][] = [];
  for (let s = 0; s < nfa.n; s++) {
    if (nfa.eps[s].size) deterministic = false;
    for (const ch of alphabet) {
      const size = (nfa.trans[s].get(ch) || new Set()).size;
      if (size > 1) deterministic = false;
      if (size === 0) missing.push([names[s], ch]);
    }
  }
  return { nfa, names, deterministic, missing, edges: edges.map((e) => ({ from: index.get(e.from)!, to: index.get(e.to)!, sym: e.sym })) };
}


const CMP: Record<string, (a: number, b: number) => boolean> = {
  "=": (a, b) => a === b, "!=": (a, b) => a !== b,
  ">=": (a, b) => a >= b, "<=": (a, b) => a <= b,
  ">": (a, b) => a > b, "<": (a, b) => a < b,
};

/** A string rewritten by replacements, with at[i] the source index of character i, so errors can point at what was typed. */
interface Mapped { s: string; at: number[] }
function replaceMapped(m: Mapped, re: RegExp, rep: string): Mapped {
  let s = "";
  const at: number[] = [];
  let last = 0;
  for (const hit of m.s.matchAll(re)) {
    const i = hit.index!;
    for (let k = last; k < i; k++) { s += m.s[k]; at.push(m.at[k]); }
    for (const ch of rep) { s += ch; at.push(m.at[i]); }
    last = i + hit[0].length;
  }
  for (let k = last; k < m.s.length; k++) { s += m.s[k]; at.push(m.at[k]); }
  at.push(m.at[m.s.length]);
  return { s, at };
}

/** A count test: modular (count mod m = r) or a comparison (count op k). */
type NumericTest = { mod: number; r: number; op?: undefined; k?: undefined } | { op: string; k: number; mod?: undefined; r?: undefined };

/**
 * Parses a language description into its minimal DFA. Each condition becomes a small DFA whose
 * state is the least it must remember; and, or and xor use the product construction, and not
 * uses the complement. Examples:
 *   #_ab(w) = 1            #a is even              |w| mod 3 = 0
 *   starts with aba        ends in aa              contains bab
 *   first = last           sum divisible by 3      value mod 3 = 0
 * combined with and, or, xor, not and parentheses (precedence: not, and, xor, or).
 * Throws EngineError whose from/to point into `src`.
 */
export function parseSpec(src: string, alphabet: readonly string[]): DFA<never> {
  // spell symbol operators as words, keeping a map back to src for error positions
  let mapped: Mapped = { s: src, at: Array.from({ length: src.length + 1 }, (_, i) => i) };
  for (const [re, rep] of [
    [/≥/g, ">="], [/≤/g, "<="], [/≠/g, "!="], [/==/g, "="],
    [/∧/g, " and "], [/∨/g, " or "], [/¬/g, " not "], [/⊕/g, " xor "],
  ] as [RegExp, string][]) mapped = replaceMapped(mapped, re, rep);
  const s = mapped.s;
  let pos = 0;
  // source range of normalized [a, b)
  const range = (a: number, b: number) => {
    const from = mapped.at[Math.min(a, s.length)];
    const to = b > a ? mapped.at[Math.min(b - 1, s.length - 1)] + 1 : from;
    return { from, to: Math.max(to, from) };
  };
  const tokenEnd = (p: number) => { let e = p; while (e < s.length && !/\s/.test(s[e])) e++; return e; };
  const fail = (msg: string, a = pos, b = tokenEnd(a)): never => { throw new EngineError(msg, range(a, b)); };
  const ws = () => { while (/\s/.test(s[pos] || "")) pos++; };
  const eat = (re: RegExp): RegExpMatchArray | null => {
    ws();
    const m = s.slice(pos).match(new RegExp("^(?:" + re.source + ")", "i"));
    if (!m) return null;
    pos += m[0].length;
    return m;
  };
  let condStart = 0;
  const word = (v: string | undefined): string => {
    if (!v) fail("A substring is missing.", condStart, pos);
    for (const c of v!) if (!alphabet.includes(c)) fail(`"${c}" in "${v}" is not in the alphabet {${alphabet.join(", ")}}.`, condStart, pos);
    return v!;
  };
  const machine = <S,>(init: S, step: (s: S, ch: string) => S, accept: (s: S) => unknown) => dfaFromMachine(alphabet, init, step, accept);

  // "<quantity> = 2", "<quantity> mod 3 = 0", "<quantity> is even", "<quantity> divisible by 3"
  function numericTest(what: string): NumericTest {
    let m: RegExpMatchArray | null;
    if ((m = eat(/mod\s*(\d+)\s*=\s*(\d+)/))) return { mod: +m[1], r: +m[2] % +m[1] };
    if ((m = eat(/(?:is\s+)?(even|odd)\b/))) return { mod: 2, r: m[1].toLowerCase() === "odd" ? 1 : 0 };
    if ((m = eat(/(?:is\s+)?divisible\s+by\s+(\d+)/))) return { mod: +m[1], r: 0 };
    if ((m = eat(/(>=|<=|!=|=|>|<)\s*(\d+)/))) return { op: m[1], k: +m[2] };
    // two unbounded counts (like #a = #b) cannot be tracked with finitely many states
    if (eat(/(>=|<=|!=|=|>|<)\s*#/)) fail("Comparing two counts with each other (like #a = #b) is usually not a regular language, so it can't be described here. If your language is regular, enter a reference regular expression instead.", condStart, tokenEnd(pos));
    ws();
    return fail(`After ${what}, expected a comparison such as "= 2", ">= 1", "mod 3 = 0" or "is even".`);
  }
  // A count capped at k+1 is enough for any comparison with k, so the state set stays finite.
  function counter(test: NumericTest) {
    if (test.mod !== undefined) {
      if (test.mod < 1) fail("mod needs a positive number.", condStart, pos);
      return { norm: (c: number) => c % test.mod, ok: (c: number) => c === test.r };
    }
    return { norm: (c: number) => Math.min(c, test.k + 1), ok: (c: number) => CMP[test.op](c, test.k) };
  }

  function atom(): DFA {
    let m: RegExpMatchArray | null;
    if (eat(/\(/)) {
      const d = orExpr();
      if (!eat(/\)/)) { ws(); fail("Missing closing parenthesis."); }
      return d;
    }
    ws();
    condStart = pos;
    if ((m = eat(/#_?\{?([^\s(){}=<>!]+)\}?(?:\(w\))?/))) {
      const v = word(m[1]);
      const { norm, ok } = counter(numericTest(`#${v}(w)`));
      // remember the last |v|-1 symbols, so overlapping occurrences are counted
      const keep = v.length - 1;
      return machine<[string, number]>(["", 0], ([buf, c], ch) => {
        const nb = (buf + ch).slice(-v.length);
        return [keep ? nb.slice(-keep) : "", norm(c + (nb === v ? 1 : 0))];
      }, ([, c]) => ok(c));
    }
    if (eat(/\|w\||length|len\(w\)/)) {
      const { norm, ok } = counter(numericTest("|w|"));
      return machine<number>(0, (c) => norm(c + 1), ok);
    }
    if (eat(/sum(?:\s+of\s+digits)?(?:\(w\))?/)) {
      for (const c of alphabet) if (!/\d/.test(c)) fail(`"sum" needs an alphabet of digits, but "${c}" is not a digit.`, condStart, pos);
      const { norm, ok } = counter(numericTest("sum"));
      return machine<number>(0, (c, ch) => norm(c + Number(ch)), ok);
    }
    if (eat(/value(?:\(w\))?/)) {
      for (const c of alphabet) if (!/\d/.test(c)) fail(`"value" needs an alphabet of digits, but "${c}" is not a digit.`, condStart, pos);
      const test = numericTest("value");
      if (test.mod === undefined) fail(`"value" supports "mod m = r" and "divisible by m".`, condStart, pos);
      const mod = test.mod!;
      // -1 marks "nothing read yet": the empty string is not a number, so it is not in the language
      return machine<number>(-1, (c, ch) => ((c < 0 ? 0 : c) * 10 + Number(ch)) % mod, (c) => c === test.r);
    }
    if ((m = eat(/(?:w\s+)?(?:starts|begins)\s+with\s+(\S+?)(?=[\s)]|$)/))) {
      const v = word(m[1]);
      // state: how much of v has matched; -1 is the dead state after a mismatch
      return machine<number>(0, (i, ch) => (i === v.length ? i : i >= 0 && v[i] === ch ? i + 1 : -1), (i) => i === v.length);
    }
    if ((m = eat(/(?:w\s+)?ends\s+(?:with|in)\s+(\S+?)(?=[\s)]|$)/))) {
      const v = word(m[1]);
      return machine("", (buf, ch) => (buf + ch).slice(-v.length), (buf) => buf === v);
    }
    if ((m = eat(/(?:w\s+)?contains\s+(\S+?)(?=[\s)]|$)/))) {
      const v = word(m[1]);
      // once v has been seen the state stays v
      return machine("", (buf, ch) => (buf === v ? v : (buf + ch).slice(-v.length)), (buf) => buf === v);
    }
    if ((m = eat(/first\s*(!=|=)\s*last/))) {
      // ε has no first or last symbol; it counts as "first = last", so "first != last" rejects it
      const same = m[1] === "=";
      return machine<[string, string] | null>(null, (st, ch) => [st ? st[0] : ch, ch], (st) => (st ? (st[0] === st[1]) === same : same));
    }
    if (eat(/true|anything|all strings/)) return machine(0, () => 0, () => true);
    ws();
    return fail(pos >= s.length
      ? "The description ends where a condition was expected."
      : `Could not understand "${s.slice(pos, pos + 20).trim()}". Try forms like "#_ab(w) = 1", "starts with aba", "ends in aa", "|w| is even".`);
  }
  function notExpr(): DFA { return eat(/not\b/) ? complement(notExpr()) : atom(); }
  function andExpr(): DFA { let d = notExpr(); while (eat(/and\b|&&?/)) d = product(d, notExpr(), (a, b) => a && b); return d; }
  function xorExpr(): DFA { let d = andExpr(); while (eat(/xor\b/)) d = product(d, andExpr(), (a, b) => a !== b); return d; }
  function orExpr(): DFA { let d = xorExpr(); while (eat(/or\b|\|\|/)) d = product(d, xorExpr(), (a, b) => a || b); return d; }

  if (!s.trim()) fail("Describe the language.", 0, 0);
  const d = orExpr();
  ws();
  if (pos < s.length) fail(`Could not understand "${s.slice(pos, pos + 20).trim()}". Join conditions with "and", "or", "xor" or "not".`);
  return minimize(d).dfa;
}


/** Two strings that reach the same state of a DFA but must be told apart: exactly one of uz, vz is in L. */
export interface Conflated {
  /** |u| + |v| + |z|; the smallest example is kept */
  cost: number;
  /** the state of the compared DFA (compare's `student` argument) that u and v both reach */
  sharedState: number;
  u: string;
  v: string;
  z: string;
  uIn: boolean;
  vIn: boolean;
}

/** The result of comparing an answer DFA with the reference language. */
export interface Comparison {
  correct: boolean;
  /** shortest string the answer accepts but should not */
  extra: string | null;
  /** shortest string the answer rejects but should accept */
  missing: string | null;
  /** states in the minimal DFA of the reference language */
  minStates: number;
  /** set only when the answer is wrong */
  conflated?: Conflated | null;
}

/** Compares an answer DFA with the reference. Both counterexamples are shortest, found by BFS over state pairs. */
export function compare(student: DFA, reference: DFA): Comparison {
  const ref = minimize(reference).dfa;
  const extra = witness(student, ref, (a, b) => a && !b);
  const missing = witness(student, ref, (a, b) => !a && b);
  const result: Comparison = { correct: extra === null && missing === null, extra, missing, minStates: ref.n };
  if (!result.correct) result.conflated = findConflated(student, ref);
  return result;
}

/**
 * Finds the cheapest pair u, v that the student's DFA merges but the reference separates,
 * plus a distinguishing suffix z. Only exists when the answer is wrong.
 */
function findConflated(student: DFA, ref: DFA): Conflated | null {
  // shortest string reaching each reachable (student state, reference state) pair
  const seen = new Map([[student.start + "," + ref.start, ""]]);
  const q: [number, number][] = [[student.start, ref.start]];
  const byStudent = new Map<number, [number, string][]>();
  for (let i = 0; i < q.length; i++) {
    const [p, r] = q[i];
    const w = seen.get(p + "," + r)!;
    if (!byStudent.has(p)) byStudent.set(p, []);
    byStudent.get(p)!.push([r, w]);
    student.alphabet.forEach((ch, c) => {
      const p2 = student.delta[p][c], r2 = ref.delta[r][c], key = p2 + "," + r2;
      if (!seen.has(key)) { seen.set(key, w + ch); q.push([p2, r2]); }
    });
  }
  let best: Conflated | null = null;
  // compare the first string reaching each student state with the others reaching it
  for (const [state, list] of byStudent) {
    for (let i = 1; i < list.length; i++) {
      const [r1, u] = list[0], [r2, v] = list[i];
      const z = distinguish(ref, r1, r2);
      if (z === null) continue;
      const cost = u.length + v.length + z.length;
      if (!best || cost < best.cost) best = { cost, sharedState: state, u, v, z, uIn: accepts(ref, u + z), vIn: accepts(ref, v + z) };
    }
  }
  return best;
}

/** BFS for the shortest distinguishing suffix of states p and q; null if they are equivalent. */
export function distinguish(d: DFA, p: number, q: number): string | null {
  const seen = new Set([p + "," + q]);
  const queue: [number, number, string][] = [[p, q, ""]];
  for (let i = 0; i < queue.length; i++) {
    const [a, b, z] = queue[i];
    if (d.accept[a] !== d.accept[b]) return z;
    d.alphabet.forEach((ch, c) => {
      const a2 = d.delta[a][c], b2 = d.delta[b][c], key = a2 + "," + b2;
      if (!seen.has(key)) { seen.add(key); queue.push([a2, b2, z + ch]); }
    });
  }
  return null;
}

/** The Myhill–Nerode classes of a language: a shortest representative string per state of its minimal DFA. */
export function nerodeClasses(reference: DFA): { rep: string; accepting: boolean }[] {
  const min = minimize(reference).dfa;
  const acc = accessStrings(min);
  return acc.map((w, i) => ({ rep: w!, accepting: min.accept[i] }));
}

/** Parses an alphabet of single-character symbols separated by spaces or commas; braces are ignored. Throws EngineError. */
export function parseAlphabet(src: string): string[] {
  const chars = [...new Set(src.replace(/[\s,{}]/g, ""))];
  if (!chars.length) throw new EngineError("The alphabet is empty. Enter its symbols, for example: a b");
  for (const c of chars) if ("()+*|#ε∅".includes(c)) {
    const from = src.indexOf(c);
    throw new EngineError(`"${c}" can't be an alphabet symbol because it has a meaning in the notation.`, { from, to: from + c.length });
  }
  return chars;
}

/** A string for display: ε for the empty string. */
export const show = (w: string): string => (w === "" ? EPS : w);


/** Regular expression tree used when building an expression from an automaton. */
type Rx =
  | { t: "empty" }
  | { t: "eps" }
  | { t: "sym"; c: string }
  | { t: "or"; items: Rx[] }
  | { t: "cat"; items: Rx[] }
  | { t: "star"; a: Rx };

const EMPTY: Rx = { t: "empty" };
const EPSILON: Rx = { t: "eps" };

/** Course notation with the fewest parentheses: star binds tighter than concatenation, which binds tighter than +. */
function printRx(r: Rx, ctx = 0): string {
  switch (r.t) {
    case "empty": return "∅";
    case "eps": return EPS;
    case "sym": return r.c;
    case "star": return printRx(r.a, 2) + "*";
    case "cat": { const s = r.items.map((x) => printRx(x, 1)).join(""); return ctx > 1 ? `(${s})` : s; }
    case "or": { const s = r.items.map((x) => printRx(x, 0)).join("+"); return ctx > 0 ? `(${s})` : s; }
  }
}
// the printed form doubles as a structural key for deduplication
const key = (r: Rx) => printRx(r);
/** Whether r matches ε. */
const nullable = (r: Rx): boolean =>
  r.t === "eps" || r.t === "star" || (r.t === "or" && r.items.some(nullable)) || (r.t === "cat" && r.items.every(nullable));

/** Smart constructors: each applies only identities that keep the language the same (∅ and ε laws, idempotence). */
function rxOr(xs: Rx[]): Rx {
  let items: Rx[] = [];
  for (const x of xs) items.push(...(x.t === "or" ? x.items : [x]));
  items = items.filter((x) => x.t !== "empty");
  const seen = new Map<string, Rx>();
  for (const x of items) seen.set(key(x), x);
  items = [...seen.values()];
  // r is redundant beside r*, and ε is redundant beside anything that already matches ε
  const stars = new Set(items.filter((x) => x.t === "star").map((x) => key((x as { a: Rx }).a)));
  items = items.filter((x) => !stars.has(key(x)));
  // ε + rr* = r* (and ε + r*r = r*)
  if (items.some((x) => x.t === "eps")) {
    items = items.map((x) => {
      if (x.t !== "cat" || x.items.length !== 2) return x;
      const [p, q] = x.items;
      if (q.t === "star" && key(q.a) === key(p)) return q;
      if (p.t === "star" && key(p.a) === key(q)) return p;
      return x;
    });
  }
  if (items.some((x) => x.t !== "eps" && nullable(x))) items = items.filter((x) => x.t !== "eps");
  if (!items.length) return EMPTY;
  if (items.length === 1) return items[0];
  const rank = (x: Rx) => (x.t === "sym" ? 0 : x.t === "eps" ? 2 : 1);
  items.sort((a, b) => rank(a) - rank(b) || key(a).length - key(b).length || (key(a) < key(b) ? -1 : 1));
  return { t: "or", items };
}

function rxCat(xs: Rx[]): Rx {
  const items: Rx[] = [];
  for (const x of xs) {
    if (x.t === "empty") return EMPTY;
    if (x.t === "eps") continue;
    for (const y of x.t === "cat" ? x.items : [x]) {
      const prev = items[items.length - 1];
      if (prev && prev.t === "star" && y.t === "star" && key(prev) === key(y)) continue; // r*r* = r*
      items.push(y);
    }
  }
  if (!items.length) return EPSILON;
  return items.length === 1 ? items[0] : { t: "cat", items };
}

function rxStar(a: Rx): Rx {
  if (a.t === "empty" || a.t === "eps") return EPSILON;
  if (a.t === "star") return a;
  if (a.t === "or") {
    // (ε + r)* = r*, and (r* + s*)* = (r + s)*
    const inner = a.items.filter((x) => x.t !== "eps").map((x) => (x.t === "star" ? x.a : x));
    const u = rxOr(inner);
    return u.t === "star" ? u : u.t === "eps" || u.t === "empty" ? EPSILON : { t: "star", a: u };
  }
  return { t: "star", a };
}

/**
 * A regular expression for the language of d, in course notation, by state elimination on the
 * minimal DFA (dead state removed). The result always describes exactly L(d); the simplifications
 * only shorten it.
 */
export function dfaToRegex(d: DFA): string {
  // try the greedy order and a few seeded variations of it; keep the shortest expression
  let best = eliminate(d, 0);
  const tries = minimize(d).dfa.n <= 12 ? 24 : 6;
  for (let seed = 1; seed <= tries; seed++) {
    const r = eliminate(d, seed);
    if (r.length < best.length) best = r;
  }
  return best;
}

/**
 * State elimination on a generalized automaton whose edges carry regular expressions.
 * Seed 0 removes the state that creates the least text; other seeds jitter that cost to explore other orders.
 */
function eliminate(d: DFA, seed: number): string {
  let rnd = seed * 2654435761 % 4294967296;
  const jitter = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return 1 + (rnd / 2147483648) * 0.9; };
  const min = minimize(d).dfa;
  const live = canReach(min, true); // the other states are dead
  if (!live[min.start]) return "∅";

  // generalized automaton: states 0..n-1, plus S = n (new start) and F = n + 1 (new accept)
  const n = min.n, S = n, F = n + 1;
  const R: Rx[][] = Array.from({ length: n + 2 }, () => Array.from({ length: n + 2 }, () => EMPTY));
  const add = (i: number, j: number, r: Rx) => { R[i][j] = rxOr([R[i][j], r]); };
  add(S, min.start, EPSILON);
  for (let s = 0; s < n; s++) {
    if (!live[s]) continue;
    if (min.accept[s]) add(s, F, EPSILON);
    min.alphabet.forEach((c, ci) => { const t = min.delta[s][ci]; if (live[t]) add(s, t, { t: "sym", c }); });
  }

  const remaining = new Set<number>();
  for (let s = 0; s < n; s++) if (live[s]) remaining.add(s);
  const nodes = () => [S, ...remaining, F];
  while (remaining.size) {
    // eliminate the state whose removal creates the least text
    let best = -1, bestCost = Infinity;
    for (const k of remaining) {
      const ins = nodes().filter((i) => i !== k && R[i][k].t !== "empty");
      const outs = nodes().filter((j) => j !== k && R[k][j].t !== "empty");
      let cost = ins.reduce((a, i) => a + key(R[i][k]).length, 0) * outs.length + outs.reduce((a, j) => a + key(R[k][j]).length, 0) * ins.length + key(R[k][k]).length * ins.length * outs.length;
      if (seed) cost *= jitter();
      if (cost < bestCost) { bestCost = cost; best = k; }
    }
    const k = best;
    const loop = rxStar(R[k][k]);
    for (const i of nodes()) {
      if (i === k || R[i][k].t === "empty") continue;
      for (const j of nodes()) {
        if (j === k || R[k][j].t === "empty") continue;
        add(i, j, rxCat([R[i][k], loop, R[k][j]]));
      }
    }
    remaining.delete(k);
    for (const i of nodes()) { R[i][k] = EMPTY; R[k][i] = EMPTY; }
  }
  return printRx(R[S][F]);
}
