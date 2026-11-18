/**
 * The automata engine: parsing, constructions and comparison for regular languages.
 *
 * Every input becomes a total DFA over a fixed alphabet. Regexes go through an inductive NFA and
 * the subset construction, descriptions through one DFA over the quantities they track, written
 * automata through the subset construction. DFAs are then minimized (Moore), compared and explained.
 *
 * Erasable TypeScript with no DOM or dependencies, so Node runs it directly in the tests.
 */

export const EPS = "ε";
/** Caps every BFS-built DFA so a pathological input can't hang the page. */
const STATE_LIMIT = 20000;


/**
 * A problem in the student's input, with a message written for them. `from`/`to` locate it in the
 * text (0-based, `to` exclusive); `line` locates it in an automaton (1-based).
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
  /** what each state stands for when built from another machine, e.g. a set of NFA states */
  labels?: L[];
}

/**
 * Explores an implicit machine breadth-first from `init`, numbering states as they are first seen.
 * States are keyed by their JSON, so `step` may return fresh arrays. Throws past STATE_LIMIT.
 */
function dfaFromMachine<S>(
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

/**
 * Moore partition refinement, numbered in BFS order (start = 0). `classOf` maps each state of d to
 * its state in the result, or -1 if unreachable.
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
  // round k groups states that agree on all strings of length ≤ k; groups only split, so the first
  // round that adds none is the fixed point (Myhill–Nerode equivalence)
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

/** A shortest string reaching each state (alphabetically first among ties); undefined if unreachable. */
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

/** The shortest w with pred(a accepts w, b accepts w), by BFS over state pairs; null if none. */
function witness(a: DFA, b: DFA, pred: (x: boolean, y: boolean) => boolean): string | null {
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

/** Per state: can it reach a state whose acceptance is `want`? */
function canReach(d: DFA, want: boolean): boolean[] {
  const live = d.accept.map((a) => a === want);
  for (let changed = true; changed;) {
    changed = false;
    for (let s = 0; s < d.n; s++) if (!live[s] && d.delta[s].some((t) => live[t])) { live[s] = true; changed = true; }
  }
  return live;
}

/** The first `limit` strings, shortest first, that d accepts (want) or rejects (!want). */
export function sampleStrings(d: DFA, want: boolean, limit: number): string[] {
  const live = canReach(d, want);
  const out: string[] = [];
  if (!live[d.start]) return out;
  const q: [number, string][] = [[d.start, ""]];
  // only states that can still reach a wanted one are entered; the cap bounds sparse languages
  for (let i = 0; i < q.length && out.length < limit && i < 50000; i++) {
    const [s, w] = q[i];
    if (d.accept[s] === want) out.push(w);
    d.alphabet.forEach((ch, c) => { const t = d.delta[s][c]; if (live[t]) q.push([t, w + ch]); });
  }
  return out;
}


/** An NFA with ε-moves. States are 0..n-1; a missing entry in `trans` means no move. */
export interface NFA {
  alphabet: string[];
  n: number;
  start: number;
  accept: Set<number>;
  /** trans[s].get(ch) is the set of states reached from s on ch */
  trans: Map<string, Set<number>>[];
  /** eps[s] is the set of states reached from s by one ε-move */
  eps: Set<number>[];
  add(): number;
  /** `ch` may be ε */
  edge(from: number, ch: string, to: number): void;
}

function newNfa(alphabet: readonly string[]): NFA {
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

/** The ε-closure of a set of states, sorted so equal sets get the same key. */
function closure(nfa: NFA, set: Iterable<number>): number[] {
  const out = new Set(set), stack = [...out];
  while (stack.length) for (const t of nfa.eps[stack.pop()!]) if (!out.has(t)) { out.add(t); stack.push(t); }
  return [...out].sort((x, y) => x - y);
}

/**
 * Subset construction; `labels[i]` is the set of NFA states behind DFA state i. A missing move leads
 * to the empty set, a rejecting trap, which is why missing DFA moves count as rejecting.
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
 * Recursive descent over course notation: union (+, |, ∪) binds loosest, then concatenation, then *.
 * ε (also ϵ, λ) is the empty string, ∅ the empty set. Error positions refer to `src` as typed.
 */
export function parseRegex(src: string, alphabet: readonly string[]): RegexAst {
  // parse without whitespace; srcAt maps each character back to the typed text
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

/**
 * An NFA for a regex, by induction on its structure:
 * - symbol: two states joined by it; ε: one accepting state; ∅: one rejecting state
 * - R + S: a new start with ε-moves into both; both keep their accepting states
 * - RS: ε-moves from R's accepting states to the start of S
 * - R*: a new accepting start with an ε-move into R, and ε-moves from R's accepting states back
 * States are numbered as created, so the start is always 0.
 */
export function regexToNfa(ast: RegexAst, alphabet: readonly string[]): NFA {
  const nfa = newNfa(alphabet);
  function build(node: RegexAst): { start: number; accept: number[] } {
    switch (node.t) {
      case "eps": { const s = nfa.add(); return { start: s, accept: [s] }; }
      case "empty": return { start: nfa.add(), accept: [] };
      case "sym": { const s = nfa.add(), f = nfa.add(); nfa.edge(s, node.c, f); return { start: s, accept: [f] }; }
      case "union": {
        const s = nfa.add(), a = build(node.a), b = build(node.b);
        nfa.edge(s, EPS, a.start);
        nfa.edge(s, EPS, b.start);
        return { start: s, accept: [...a.accept, ...b.accept] };
      }
      case "concat": {
        const a = build(node.a), b = build(node.b);
        for (const f of a.accept) nfa.edge(f, EPS, b.start);
        return { start: a.start, accept: b.accept };
      }
      case "star": {
        const s = nfa.add(), a = build(node.a);
        nfa.edge(s, EPS, a.start);
        for (const f of a.accept) nfa.edge(f, EPS, s);
        return { start: s, accept: [s] };
      }
    }
  }
  const { start, accept } = build(ast);
  nfa.start = start;
  for (const f of accept) nfa.accept.add(f);
  return nfa;
}

/** The minimal DFA of a regular expression. Throws EngineError for bad input. */
export function regexToDfa(src: string, alphabet: readonly string[]): DFA<never> {
  return minimize(nfaToDfa(regexToNfa(parseRegex(src, alphabet), alphabet))).dfa;
}


/** An automaton as written, states numbered by first appearance (start first). */
export interface ParsedAutomaton {
  nfa: NFA;
  names: string[];
  /** no ε-moves and at most one move per state and symbol */
  deterministic: boolean;
  /** [state name, symbol] pairs with no move */
  missing: [string, string][];
  /** one entry per transition symbol, as written */
  edges: { from: number; to: number; sym: string }[];
}

/** What one line of an automaton says, or why it can't be read. */
export type AutomatonLine =
  | { t: "start"; name: string }
  | { t: "accept"; names: string[] }
  | { t: "move"; from: string; symbols: string[]; to: string }
  | { t: "error"; message: string };

/**
 * Reads an automaton line by line (1-based), skipping blanks and comments (`//`, `%`). Shared by
 * parseAutomaton, which stops at the first bad line, and the draft drawing, which skips bad lines.
 */
export function readAutomatonLines(src: string, alphabet: readonly string[]): { line: number; read: AutomatonLine }[] {
  const out: { line: number; read: AutomatonLine }[] = [];
  src.split("\n").forEach((raw, ln) => {
    const line = raw.replace(/(\/\/|%).*$/, "").trim();
    if (line) out.push({ line: ln + 1, read: readLine(line) });
  });
  return out;

  function readLine(line: string): AutomatonLine {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(start|initial)\s*[:=]\s*(\S+)$/i))) return { t: "start", name: m[2] };
    if ((m = line.match(/^(accept|accepting|final)\s*[:=]\s*(.*)$/i))) return { t: "accept", names: m[2].split(/[\s,]+/).filter(Boolean) };
    const parts = line.replace(/->|→/g, " ").split(/\s+/);
    if (parts.length !== 3) return { t: "error", message: `expected "state symbol state", for example "q0 a q1".` };
    const [from, syms, to] = parts;
    const symbols: string[] = [];
    for (let sym of syms.split(",").filter(Boolean)) {
      if (/^(eps|epsilon|ϵ|λ)$/i.test(sym)) sym = EPS;
      if (sym !== EPS && !alphabet.includes(sym)) return { t: "error", message: `"${sym}" is not in the alphabet {${alphabet.join(", ")}}.` };
      symbols.push(sym);
    }
    return { t: "move", from, symbols, to };
  }
}

/**
 * Parses the transition format:
 *     start: q0
 *     accept: q1 q2
 *     q0 a q1
 *     q0 a,b q0        several symbols at once
 *     q1 ε q2          an ε-move makes it an NFA
 */
export function parseAutomaton(src: string, alphabet: readonly string[]): ParsedAutomaton {
  const names: string[] = [], index = new Map<string, number>();
  const id = (name: string) => { if (!index.has(name)) { index.set(name, names.length); names.push(name); } return index.get(name)!; };
  let start: string | null = null;
  const accept: string[] = [], acceptLine = new Map<string, number>();
  const edges: { from: string; sym: string; to: string }[] = [];
  for (const { line, read } of readAutomatonLines(src, alphabet)) {
    if (read.t === "error") throw new EngineError(`Line ${line}: ${read.message}`, { line });
    if (read.t === "start") start = read.name;
    else if (read.t === "accept") {
      for (const a of read.names) if (!acceptLine.has(a)) acceptLine.set(a, line);
      accept.push(...read.names);
    } else for (const sym of read.symbols) edges.push({ from: read.from, sym, to: read.to });
  }
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


/** The comparison operators of the description syntax. */
const CMP: Record<string, (a: number, b: number) => boolean> = {
  "=": (a, b) => a === b, "!=": (a, b) => a !== b,
  ">=": (a, b) => a >= b, "<=": (a, b) => a <= b,
  ">": (a, b) => a > b, "<": (a, b) => a < b,
};

/** A rewritten string; `at[i]` is the source index of character i, so errors point at the typed text. */
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

/** `count mod m = r`, or `count op k`. */
type NumericTest = { mod: number; r: number; op?: undefined; k?: undefined } | { op: string; k: number; mod?: undefined; r?: undefined };

/** Something a description talks about, which its DFA tracks while reading w. */
type Quantity =
  | { kind: "count"; pattern: string }
  | { kind: "length" }
  | { kind: "sum" }
  | { kind: "value" }
  | { kind: "prefix"; pattern: string }
  | { kind: "suffix"; pattern: string }
  | { kind: "firstLast" };

/** A description as a tree of conditions; `q` is the index of the quantity a condition is about. */
type Condition =
  | { t: "numeric"; q: number; test: NumericTest }
  | { t: "prefix" | "suffix"; q: number }
  | { t: "firstLast"; q: number; same: boolean }
  | { t: "true" }
  | { t: "not"; a: Condition }
  | { t: "and" | "or" | "xor"; a: Condition; b: Condition };

/** A parsed description: the condition tree, the quantities it mentions, and the numeric tests on each. */
interface Description { cond: Condition; quantities: Quantity[]; tests: NumericTest[][] }

/**
 * Parses a description. Conditions:
 *   #_ab(w) = 1        #_a(w) mod 2 = 0       |w| >= 3        sum mod 3 = 0     value mod 3 = 0
 *   starts with aba    ends in aa             first = last    first != last
 * joined by not, and, xor, or (tightest first) and parentheses. Each form has one spelling; retired
 * ones (contains, is even, divisible by, begins with, ends with, length) name their replacement.
 */
function parseDescription(src: string, alphabet: readonly string[]): Description {
  // spell symbol operators as words, keeping positions mapped back to src
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
  // a spelling that is no longer accepted: point at it and name the replacement
  const retired = (re: RegExp, instead: (m: RegExpMatchArray) => string) => {
    ws();
    const at = pos, m = eat(re);
    if (m) fail(`Write ${instead(m)} instead of "${m[0].trim()}".`, at, pos);
  };
  let condStart = 0;
  const word = (v: string | undefined): string => {
    if (!v) fail("A substring is missing.", condStart, pos);
    for (const c of v!) if (!alphabet.includes(c)) fail(`"${c}" in "${v}" is not in the alphabet {${alphabet.join(", ")}}.`, condStart, pos);
    return v!;
  };
  const digitsOnly = (what: string) => {
    for (const c of alphabet) if (!/^\d$/.test(c)) fail(`"${what}" needs an alphabet of digits, but "${c}" is not a digit.`, condStart, pos);
  };

  const quantities: Quantity[] = [], tests: NumericTest[][] = [], index = new Map<string, number>();
  const use = (q: Quantity) => {
    const key = JSON.stringify(q);
    if (!index.has(key)) { index.set(key, quantities.length); quantities.push(q); tests.push([]); }
    return index.get(key)!;
  };
  const numeric = (q: Quantity, test: NumericTest): Condition => {
    const i = use(q);
    tests[i].push(test);
    return { t: "numeric", q: i, test };
  };

  // "= 2", ">= 1", "mod 3 = 0" after a quantity
  function numericTest(what: string): NumericTest {
    let m: RegExpMatchArray | null;
    retired(/(?:is\s+)?(even|odd)\b/, (r) => `"mod 2 = ${r[1].toLowerCase() === "odd" ? 1 : 0}"`);
    retired(/(?:is\s+)?divisible\s+by\s+(\d+)/, (r) => `"mod ${r[1]} = 0"`);
    ws();
    const at = pos;
    if ((m = eat(/mod\s*(\d+)\s*=\s*(\d+)/))) {
      if (+m[1] < 1) fail("mod needs a positive number.", at, pos);
      return { mod: +m[1], r: +m[2] % +m[1] };
    }
    if ((m = eat(/(>=|<=|!=|=|>|<)\s*(\d+)/))) return { op: m[1], k: +m[2] };
    // comparing two unbounded counts needs infinitely many states
    if (eat(/(>=|<=|!=|=|>|<)\s*#/)) fail("Comparing two counts with each other (like #a = #b) usually gives a language that is not regular, so it can't be described here.", condStart, tokenEnd(pos));
    ws();
    return fail(`After ${what}, expected a comparison such as "= 2", ">= 1" or "mod 3 = 0".`);
  }

  function atom(): Condition {
    let m: RegExpMatchArray | null;
    if (eat(/\(/)) {
      const c = orExpr();
      if (!eat(/\)/)) { ws(); fail("Missing closing parenthesis."); }
      return c;
    }
    ws();
    condStart = pos;
    retired(/(?:w\s+)?contains\s+(\S+?)(?=[\s)]|$)/, (r) => `"#_${r[1]}(w) > 0"`);
    retired(/(?:w\s+)?begins\s+with\b/, () => `"starts with"`);
    retired(/(?:w\s+)?ends\s+with\b/, () => `"ends in"`);
    retired(/length\b|len\(w\)/, () => `"|w|"`);
    if ((m = eat(/#_?\{?([^\s(){}=<>!]+)\}?(?:\(w\))?/))) {
      const v = word(m[1]);
      return numeric({ kind: "count", pattern: v }, numericTest(`#_${v}(w)`));
    }
    if (eat(/\|w\|/)) return numeric({ kind: "length" }, numericTest("|w|"));
    if (eat(/sum(?:\s+of\s+digits)?(?:\(w\))?/)) {
      digitsOnly("sum");
      return numeric({ kind: "sum" }, numericTest("sum"));
    }
    if (eat(/value(?:\(w\))?/)) {
      digitsOnly("value");
      const test = numericTest("value");
      if (test.mod === undefined) fail(`"value" supports "mod m = r" only.`, condStart, pos);
      return numeric({ kind: "value" }, test);
    }
    if ((m = eat(/(?:w\s+)?starts\s+with\s+(\S+?)(?=[\s)]|$)/))) return { t: "prefix", q: use({ kind: "prefix", pattern: word(m[1]) }) };
    if ((m = eat(/(?:w\s+)?ends\s+in\s+(\S+?)(?=[\s)]|$)/))) return { t: "suffix", q: use({ kind: "suffix", pattern: word(m[1]) }) };
    if ((m = eat(/first\s*(!=|=)\s*last/))) return { t: "firstLast", q: use({ kind: "firstLast" }), same: m[1] === "=" };
    if (eat(/true|anything|all strings/)) return { t: "true" };
    ws();
    return fail(pos >= s.length
      ? "The description ends where a condition was expected."
      : `Could not understand "${s.slice(pos, pos + 20).trim()}". Try forms like "#_ab(w) = 1", "starts with aba", "ends in aa", "|w| mod 2 = 0".`);
  }
  function notExpr(): Condition { return eat(/not\b/) ? { t: "not", a: notExpr() } : atom(); }
  function andExpr(): Condition { let c = notExpr(); while (eat(/and\b|&&?/)) c = { t: "and", a: c, b: notExpr() }; return c; }
  function xorExpr(): Condition { let c = andExpr(); while (eat(/xor\b/)) c = { t: "xor", a: c, b: andExpr() }; return c; }
  function orExpr(): Condition { let c = xorExpr(); while (eat(/or\b|\|\|/)) c = { t: "or", a: c, b: xorExpr() }; return c; }

  if (!s.trim()) fail("Describe the language.", 0, 0);
  const cond = orExpr();
  ws();
  if (pos < s.length) fail(`Could not understand "${s.slice(pos, pos + 20).trim()}". Join conditions with "and", "or", "xor" or "not".`);
  return { cond, quantities, tests };
}


/** One thing a description's DFA must remember: `what` in notation (or null) and its values in words, strings in `backticks`. */
export interface Remember { what: string | null; text: string }

/**
 * What the DFA remembers about one quantity, updated per symbol. `parts` says what a value means
 * about w, in description notation, split into independently varying parts (for #_ab(w): the
 * count, and whether w ends in a).
 */
interface Tracker {
  init: unknown;
  step(v: unknown, ch: string): unknown;
  holds(v: unknown, c: Condition): boolean;
  parts(v: unknown): { key: string; says: string }[];
  remember: Remember[];
}
/** Erases the value type so trackers of different kinds share one list. */
function tracker<V>(t: { init: V; step(v: V, ch: string): V; holds(v: V, c: Condition): boolean; parts(v: V): { key: string; says: string }[]; remember: Remember[] }): Tracker {
  return t as unknown as Tracker;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;
const tick = (x: string) => "`" + x + "`";
/** "x", "x or y", "x, y or z". */
const listOr = (xs: string[]) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " or " + xs[xs.length - 1]);
/** 0 … n-1 in words: listed when short, a range when long. */
const upTo = (n: number) => (n <= 6 ? listOr(Array.from({ length: n }, (_, i) => String(i))) : `0 to ${n - 1}`);

/** The length of the longest prefix of v, at most `max` long, that t ends in. */
function longestPrefixSuffix(v: string, t: string, max: number): number {
  for (let k = Math.min(max, t.length); k > 0; k--) if (t.endsWith(v.slice(0, k))) return k;
  return 0;
}

/**
 * The strings whose longest suffix that is a prefix of v (at most `max` long) is v[0..p): they end
 * in v[0..p) and in no longer such prefix. Only the minimal longer prefixes are negated, since
 * ending in a longer one implies ending in a shorter one it ends with.
 */
function endsClause(v: string, p: number, max: number): string {
  const mine = v.slice(0, p);
  const longer: string[] = [];
  for (let k = p + 1; k <= max; k++) if (v.slice(0, k).endsWith(mine)) longer.push(v.slice(0, k));
  const needed = longer.filter((y) => !longer.some((x) => x.length < y.length && y.endsWith(x)));
  return [...(p > 0 ? [`ends in ${mine}`] : []), ...needed.map((x) => `not ends in ${x}`)].join(" and ");
}

/**
 * A growing number (count, length, digit sum), kept exactly below `cap` and as a remainder mod
 * `mod` from there. `cap` is where every comparison has its answer (k for ">= k" and "< k", else
 * k + 1); `mod` is the lcm of the moduli. Encoding: s < cap is the number; s >= cap means at least
 * cap with remainder s - cap.
 */
function numberScale(name: string, tests: NumericTest[]) {
  const cap = Math.max(0, ...tests.map((t) => (t.op === undefined ? 0 : t.op === ">=" || t.op === "<" ? t.k : t.k + 1)));
  const mod = tests.reduce((m, t) => (t.mod !== undefined ? lcm(m, t.mod) : m), 1);
  const remember: Remember = mod === 1
    ? { what: name, text: cap <= 6 ? listOr([...Array.from({ length: cap }, (_, i) => String(i)), `at least ${cap}`]) : `0 to ${cap - 1}, or at least ${cap}` }
    : cap === 0
      ? { what: `${name} mod ${mod}`, text: upTo(mod) }
      : { what: name, text: `exactly while it is below ${cap}, then only its remainder mod ${mod}` };
  return {
    remember,
    /** every test has its answer from the start: nothing to track */
    trivial: cap === 0 && mod === 1,
    /** no further growth can change an answer */
    settled: (s: number) => mod === 1 && s >= cap,
    add: (s: number, d: number) => (s < cap && s + d < cap ? s + d : cap + ((s < cap ? s + d : s - cap + d) % mod)),
    holds: (s: number, t: NumericTest) => (t.mod !== undefined ? (s < cap ? s : s - cap) % t.mod === t.r : CMP[t.op](Math.min(s, cap), t.k)),
    says: (s: number) => (s < cap ? `${name} = ${s}`
      : mod === 1 ? `${name} >= ${cap}`
      : cap === 0 ? `${name} mod ${mod} = ${s}`
      : `${name} >= ${cap} and ${name} mod ${mod} = ${s - cap}`),
  };
}

const testOf = (c: Condition) => (c as Extract<Condition, { t: "numeric" }>).test;

/** A quantity whose tests answer the same for every string (like "#_a(w) >= 0"). */
const constant = (holds: (c: Condition) => boolean) => tracker<number>({ init: 0, step: () => 0, holds: (_, c) => holds(c), parts: () => [], remember: [] });

/** The tracker for a quantity, sized for the tests the description makes on it. */
function makeTracker(q: Quantity, tests: NumericTest[], alphabet: readonly string[]): Tracker {
  switch (q.kind) {
    case "count": {
      // the count plus progress into the next occurrence (so overlaps count); once the count is
      // settled the progress is dropped (-1) so it stops splitting states
      const v = q.pattern, n = numberScale(`#_${v}(w)`, tests), keep = v.length - 1;
      if (n.trivial) return constant((c) => n.holds(0, testOf(c)));
      return tracker<[number, number]>({
        init: [0, 0],
        step: ([p, s], ch) => {
          if (n.settled(s)) return [-1, s];
          const t = v.slice(0, p) + ch, next = n.add(s, t === v ? 1 : 0);
          return [n.settled(next) ? -1 : longestPrefixSuffix(v, t, keep), next];
        },
        holds: ([, s], c) => n.holds(s, testOf(c)),
        // progress is -1 exactly when the count is settled, so it says the same
        parts: ([p, s]) => [{ key: `n${s}`, says: n.says(s) }, ...(keep ? [{ key: `p${p}`, says: p < 0 ? n.says(s) : endsClause(v, p, keep) }] : [])],
        remember: [n.remember, ...(!keep ? []
          : keep === 1 ? [{ what: null, text: `whether w ends in ${tick(v[0])}, which could start the next ${tick(v)}` }]
          : [{ what: null, text: `how much of the next ${tick(v)} w has just read: ${listOr(["none", ...Array.from({ length: keep }, (_, k) => tick(v.slice(0, k + 1)))])}` }])],
      });
    }
    case "length": {
      const n = numberScale("|w|", tests);
      if (n.trivial) return constant((c) => n.holds(0, testOf(c)));
      return tracker<number>({ init: 0, step: (s) => n.add(s, 1), holds: (s, c) => n.holds(s, testOf(c)), parts: (s) => [{ key: `n${s}`, says: n.says(s) }], remember: [n.remember] });
    }
    case "sum": {
      const n = numberScale("sum", tests);
      if (n.trivial) return constant((c) => n.holds(0, testOf(c)));
      return tracker<number>({ init: 0, step: (s, ch) => n.add(s, Number(ch)), holds: (s, c) => n.holds(s, testOf(c)), parts: (s) => [{ key: `n${s}`, says: n.says(s) }], remember: [n.remember] });
    }
    case "value": {
      // value mod m, read left to right; -1 until a digit is read (ε has no value)
      const mod = tests.reduce((m, t) => lcm(m, t.mod!), 1);
      return tracker<number>({
        init: -1,
        step: (r, ch) => ((r < 0 ? 0 : r) * 10 + Number(ch)) % mod,
        holds: (r, c) => r >= 0 && r % testOf(c).mod! === testOf(c).r,
        parts: (r) => [{ key: `v${r}`, says: r < 0 ? "|w| = 0" : `value mod ${mod} = ${r}` }],
        remember: [{ what: `value mod ${mod}`, text: `${upTo(mod)}, once a digit has been read` }],
      });
    }
    case "prefix": {
      // how much of v has matched; v.length once it all has, -1 after a mismatch
      const v = q.pattern;
      const mismatches: string[] = [];
      for (let j = 0; j < v.length; j++) for (const c of alphabet) if (c !== v[j]) mismatches.push(`starts with ${v.slice(0, j) + c}`);
      return tracker<number>({
        init: 0,
        step: (i, ch) => (i === v.length ? i : i >= 0 && v[i] === ch ? i + 1 : -1),
        holds: (i) => i === v.length,
        parts: (i) => [{ key: `s${i}`, says: i === v.length ? `starts with ${v}` : i > 0 ? `|w| = ${i} and starts with ${v.slice(0, i)}` : i === 0 ? "|w| = 0" : mismatches.join(" or ") }],
        remember: [{ what: null, text: v.length === 1
          ? `whether w starts with ${tick(v)}: nothing read yet, yes or no`
          : `how much of ${tick(v)} w starts with: ${listOr(["none", ...Array.from({ length: v.length - 1 }, (_, k) => tick(v.slice(0, k + 1))), "all of it"])}, or that it starts some other way` }],
      });
    }
    case "suffix": {
      // longest prefix of v that w ends in (KMP): a wrong symbol falls back, it never dies
      const v = q.pattern;
      return tracker<number>({
        init: 0,
        step: (p, ch) => longestPrefixSuffix(v, v.slice(0, p) + ch, v.length),
        holds: (p) => p === v.length,
        parts: (p) => [{ key: `e${p}`, says: endsClause(v, p, v.length) }],
        remember: [{ what: null, text: v.length === 1
          ? `whether w ends in ${tick(v)}`
          : `how much of ${tick(v)} w ends in: ${listOr(["none", ...Array.from({ length: v.length - 1 }, (_, k) => tick(v.slice(0, k + 1))), "all of it"])}` }],
      });
    }
    case "firstLast":
      // ε counts as "first = last", so "first != last" rejects it
      return tracker<[string, string] | null>({
        init: null,
        step: (st, ch) => [st ? st[0] : ch, ch],
        holds: (st, c) => { const same = (c as Extract<Condition, { t: "firstLast" }>).same; return st ? (st[0] === st[1]) === same : same; },
        parts: (st) => [{ key: st ? st.join(" ") : "-", says: st ? `starts with ${st[0]} and ends in ${st[1]}` : "|w| = 0" }],
        remember: [{ what: null, text: "the first and the last symbol of w" }],
      });
  }
}

/** The DFA a description defines, whose states are combinations of its trackers' values. */
function trackedDfa(src: string, alphabet: readonly string[]) {
  const { cond, quantities, tests } = parseDescription(src, alphabet);
  const trackers = quantities.map((q, i) => makeTracker(q, tests[i], alphabet));
  const holds = (c: Condition, vals: unknown[]): boolean => {
    switch (c.t) {
      case "true": return true;
      case "not": return !holds(c.a, vals);
      case "and": return holds(c.a, vals) && holds(c.b, vals);
      case "or": return holds(c.a, vals) || holds(c.b, vals);
      case "xor": return holds(c.a, vals) !== holds(c.b, vals);
      default: return trackers[c.q].holds(vals[c.q], c);
    }
  };
  const dfa = dfaFromMachine<unknown[]>(alphabet, trackers.map((t) => t.init), (vals, ch) => vals.map((v, i) => trackers[i].step(v, ch)), (vals) => holds(cond, vals));
  return { dfa, trackers };
}

/** A description's minimal DFA (see parseDescription for the syntax). */
export function parseSpec(src: string, alphabet: readonly string[]): DFA<never> {
  return minimize(trackedDfa(src, alphabet).dfa).dfa;
}

/** A description's DFA as people design it, with the meaning of every state. */
export interface ExplainedSpec {
  /**
   * States are combinations of what the description tracks. Only the sinks are merged (one dead
   * state, one accept-everything state), so it can be larger than the minimal DFA.
   */
  dfa: DFA;
  /** q0, q1, … in BFS order, and "dead" */
  names: string[];
  /**
   * What is true of w exactly when the DFA is in each state, in description notation:
   * parseSpec(says[s]) is the set of strings reaching s. null only for a sink with no short form.
   */
  says: (string | null)[];
  /** "dead": nothing is accepted from here; "all": everything is */
  sink: ("dead" | "all" | null)[];
  /** in the order the description mentions them */
  remember: Remember[];
}

/** Renumbers d in place so state `s` comes last. */
function moveToEnd<L>(d: DFA<L>, s: number) {
  const order = [...Array.from({ length: d.n }, (_, i) => i).filter((i) => i !== s), s];
  const at = new Map(order.map((old, i) => [old, i]));
  d.delta = order.map((old) => d.delta[old].map((t) => at.get(t)!));
  d.accept = order.map((old) => d.accept[old]);
  if (d.labels) d.labels = order.map((old) => d.labels![old]);
  d.start = at.get(d.start)!;
}

/** Builds a description's DFA the way people design one, and says what each state means. */
export function explainSpec(src: string, alphabet: readonly string[]): ExplainedSpec {
  const { dfa: full, trackers } = trackedDfa(src, alphabet);
  // each state's value split into parts; id "i.j" is part j of tracker i
  const parts = full.labels!.map((vals) => trackers.flatMap((t, i) => t.parts(vals[i]).map((p, j) => ({ id: `${i}.${j}`, ...p }))));
  // a conjunction, split into single clauses so a clause said twice appears once
  const clausesOf = (says: string[]) => [...new Set(says.filter(Boolean).flatMap((x) => (/\bor\b/.test(x) ? [x] : x.split(" and "))))];
  const both = (clauses: string[]) => clauses.map((x) => (clauses.length > 1 && /\bor\b/.test(x) ? `(${x})` : x)).join(" and ");
  const conj = (says: string[]) => both(clausesOf(says));

  // merge the sinks: states from which nothing, or everything, is accepted
  const canAccept = canReach(full, true), canReject = canReach(full, false);
  const sinkOf = (s: number) => (!canAccept[s] ? "dead" : !canReject[s] ? "all" : null);
  const cls = full.accept.map((_, s) => sinkOf(s) ?? s);
  const rep = new Map<number | string, number>();
  cls.forEach((c, s) => { if (!rep.has(c)) rep.set(c, s); });
  const dfa = dfaFromMachine<number | string>(full.alphabet, cls[full.start], (c, ch) => cls[full.delta[rep.get(c)!][full.alphabet.indexOf(ch)]], (c) => full.accept[rep.get(c)!]);

  /**
   * A short, exact description of a merged sink, or null. First an "or" of single part values found
   * only in its members ("#_a(w) >= 2 or #_b(w) >= 2"); failing that, the fewest parts (2–3) whose
   * values alone decide membership, as an "or" of the members' combinations ("#_aba(w) >= 1 and
   * #_bab(w) >= 1"). Gives up past three alternatives, or when the sink is the whole DFA.
   */
  const describeSink = (members: Set<number>): string | null => {
    if (members.size === full.n) return null;
    const byValue = new Map<string, { says: string; states: number[] }>();
    parts.forEach((ps, s) => ps.filter((p) => p.says).forEach((p) => {
      const k = p.id + "=" + p.key;
      if (!byValue.has(k)) byValue.set(k, { says: p.says, states: [] });
      byValue.get(k)!.states.push(s);
    }));
    const only = [...byValue.values()].filter((v) => v.states.every((s) => members.has(s))).sort((a, b) => b.states.length - a.states.length);
    const covered = new Set<number>(), chosen: string[] = [];
    for (const v of only) {
      if (v.states.every((s) => covered.has(s))) continue;
      v.states.forEach((s) => covered.add(s));
      if (!chosen.includes(v.says)) chosen.push(v.says);
    }
    const either = (alts: string[]) => alts.map((x) => (alts.length > 1 && /\band\b|\bor\b/.test(x) ? `(${x})` : x)).join(" or ");
    if (covered.size === members.size && chosen.length <= 3) return either(chosen);

    const ids = [...new Set(parts[0].filter((p) => p.says).map((p) => p.id))];
    const valueOf = (st: number, id: string) => parts[st].find((p) => p.id === id)!;
    const subsets = (size: number, from = 0): string[][] =>
      size === 0 ? [[]] : ids.slice(from).flatMap((id, i) => subsets(size - 1, from + i + 1).map((rest) => [id, ...rest]));
    for (let size = 2; size <= Math.min(3, ids.length); size++) {
      for (const chosenIds of subsets(size)) {
        const decides = new Map<string, boolean>();
        let ok = true;
        for (let st = 0; st < full.n && ok; st++) {
          const combo = chosenIds.map((id) => valueOf(st, id).key).join("|");
          if (decides.has(combo) && decides.get(combo) !== members.has(st)) ok = false;
          else decides.set(combo, members.has(st));
        }
        if (!ok) continue;
        const combos = new Map<string, string>();
        members.forEach((st) => {
          const combo = chosenIds.map((id) => valueOf(st, id).key).join("|");
          if (!combos.has(combo)) combos.set(combo, conj(chosenIds.map((id) => valueOf(st, id).says)));
        });
        if (combos.size <= 3) return either([...combos.values()]);
      }
    }
    return null;
  };

  // the dead state goes last, so tables read from the start to the dead end
  const deadAt = dfa.labels!.indexOf("dead");
  if (deadAt >= 0) moveToEnd(dfa, deadAt);
  let k = 0;
  const labels = dfa.labels!;
  const names = labels.map((c) => (c === "dead" ? "dead" : "q" + k++));
  const sink = labels.map((c) => (typeof c === "string" ? (c as "dead" | "all") : null));
  /**
   * Shortens a description without changing its meaning: a state reached only by ε is "|w| = 0";
   * otherwise clauses are dropped (last first) while the rest, parsed back, still matches exactly
   * the strings reaching the state. Skipped for large DFAs, where checking is too slow.
   */
  const reachOf = (st: number): DFA => ({ ...dfa, accept: dfa.accept.map((_, i) => i === st), labels: undefined });
  const exact = (text: string, st: number) => compare(parseSpec(text, alphabet), reachOf(st)).correct;
  const shorten = (clauses: string[], st: number) => {
    if (dfa.n > 40 || clauses.length < 2) return clauses;
    if (exact("|w| = 0", st)) return ["|w| = 0"];
    let kept = clauses;
    for (let i = kept.length - 1; i >= 0 && kept.length > 1; i--) {
      const without = kept.filter((_, j) => j !== i);
      if (exact(both(without), st)) kept = without;
    }
    return kept;
  };
  const says = labels.map((c, st) => {
    if (typeof c === "number") return both(shorten(clausesOf(parts[c].map((p) => p.says)), st));
    const members = new Set(cls.flatMap((x, s) => (x === c ? [s] : [])));
    return describeSink(members);
  });
  delete dfa.labels;
  return { dfa, names, says, sink, remember: trackers.flatMap((t) => t.remember) };
}


/** u and v reach the same state but must be told apart: exactly one of uz, vz is in L. */
export interface Conflated {
  /** |u| + |v| + |z|; the cheapest example wins */
  cost: number;
  /** the state of compare's `student` DFA that u and v both reach */
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
  /** only when the answer is wrong */
  conflated?: Conflated | null;
}

/** Compares an answer with the reference; both counterexamples are shortest. */
export function compare(student: DFA, reference: DFA): Comparison {
  const ref = minimize(reference).dfa;
  const extra = witness(student, ref, (a, b) => a && !b);
  const missing = witness(student, ref, (a, b) => !a && b);
  const result: Comparison = { correct: extra === null && missing === null, extra, missing, minStates: ref.n };
  if (!result.correct) result.conflated = findConflated(student, ref);
  return result;
}

/** The cheapest u, v the student's DFA merges but the reference separates, with a suffix z telling them apart. */
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

/** The shortest suffix telling states p and q apart; null if they are equivalent. */
function distinguish(d: DFA, p: number, q: number): string | null {
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

/** Single-character symbols separated by spaces or commas; braces are ignored. */
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


/** A regex tree for state elimination. */
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
// the printed form doubles as a structural key
const key = (r: Rx) => printRx(r);
/** Whether r matches ε. */
const nullable = (r: Rx): boolean =>
  r.t === "eps" || r.t === "star" || (r.t === "or" && r.items.some(nullable)) || (r.t === "cat" && r.items.every(nullable));

/** Smart constructors: they apply only language-preserving identities (∅ and ε laws, idempotence). */
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

/** A regex for L(d) in course notation, by state elimination on its minimal DFA. */
export function dfaToRegex(d: DFA): string {
  const min = minimize(d).dfa;
  const moves: Move[] = [];
  min.delta.forEach((row, s) => row.forEach((t, c) => moves.push({ from: s, to: t, rx: { t: "sym", c: min.alphabet[c] } })));
  return shortestByElimination({ n: min.n, start: min.start, accept: min.accept, moves });
}

/** A regex for L(nfa), by state elimination on the automaton as written, so it follows its structure. */
export function nfaToRegex(nfa: NFA): string {
  const moves: Move[] = [];
  for (let s = 0; s < nfa.n; s++) {
    for (const [c, targets] of nfa.trans[s]) for (const t of targets) moves.push({ from: s, to: t, rx: { t: "sym", c } });
    for (const t of nfa.eps[s]) moves.push({ from: s, to: t, rx: EPSILON });
  }
  return shortestByElimination({ n: nfa.n, start: nfa.start, accept: Array.from({ length: nfa.n }, (_, s) => nfa.accept.has(s)), moves });
}

/** A generalized automaton: moves are labelled by regexes. */
interface Move { from: number; to: number; rx: Rx }
interface Generalized { n: number; start: number; accept: boolean[]; moves: Move[] }

/** The shortest result of the greedy elimination order and a few jittered variations of it. */
function shortestByElimination(g: Generalized): string {
  let best = eliminate(g, 0);
  const tries = g.n <= 12 ? 24 : 6;
  for (let seed = 1; seed <= tries; seed++) {
    const r = eliminate(g, seed);
    if (r.length < best.length) best = r;
  }
  return best;
}

/** State elimination. Seed 0 removes whichever state adds the least text; other seeds jitter that cost. */
function eliminate(g: Generalized, seed: number): string {
  let rnd = seed * 2654435761 % 4294967296;
  const jitter = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return 1 + (rnd / 2147483648) * 0.9; };
  // only states on some path from the start to an accepting state matter
  const reach = (from: boolean[], forward: boolean) => {
    const out = [...from];
    for (let changed = true; changed;) {
      changed = false;
      for (const m of g.moves) {
        const [a, b] = forward ? [m.from, m.to] : [m.to, m.from];
        if (out[a] && !out[b]) { out[b] = true; changed = true; }
      }
    }
    return out;
  };
  const fromStart = reach(g.accept.map((_, s) => s === g.start), true);
  const toAccept = reach(g.accept, false);
  const live = fromStart.map((r, s) => r && toAccept[s]);
  if (!live[g.start]) return "∅";

  // states 0..n-1, plus S = n (new start) and F = n + 1 (new accept)
  const n = g.n, S = n, F = n + 1;
  const R: Rx[][] = Array.from({ length: n + 2 }, () => Array.from({ length: n + 2 }, () => EMPTY));
  const add = (i: number, j: number, r: Rx) => { R[i][j] = rxOr([R[i][j], r]); };
  add(S, g.start, EPSILON);
  for (let s = 0; s < n; s++) if (live[s] && g.accept[s]) add(s, F, EPSILON);
  for (const m of g.moves) if (live[m.from] && live[m.to]) add(m.from, m.to, m.rx);

  const remaining = new Set<number>();
  for (let s = 0; s < n; s++) if (live[s]) remaining.add(s);
  const nodes = () => [S, ...remaining, F];
  while (remaining.size) {
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
