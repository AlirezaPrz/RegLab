// Engine tests: parsing, constructions, minimization, comparison and the feedback layer. Run with: node test.js
import * as R from "./src/engine/index.ts";
import assert from "node:assert";

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("ok   " + name); }
  catch (e) { console.log("FAIL " + name + "\n     " + e.message); process.exitCode = 1; }
}
const ab = ["a", "b"];
const same = (x, y) => R.compare(x, y).correct;
const rx = (s, alpha = ab) => R.regexToDfa(s, alpha);
const spec = (s, alpha = ab) => R.parseSpec(s, alpha);

// brute-force check of a description against a predicate on all strings up to a length
function bruteforce(dfa, alpha, pred, maxLen = 9) {
  let layer = [""];
  for (let len = 0; len <= maxLen; len++) {
    for (const w of layer) assert.strictEqual(R.accepts(dfa, w), pred(w), `disagree on "${w}"`);
    layer = layer.flatMap((w) => alpha.map((c) => w + c));
  }
}
const count = (w, v) => { let n = 0; for (let i = 0; i + v.length <= w.length; i++) if (w.startsWith(v, i)) n++; return n; };

test("regex: (a+b)* equals (a*b*)*", () => assert(same(rx("(a+b)*"), rx("(a*b*)*"))));
test("regex: ε and ∅", () => {
  assert(R.accepts(rx("ε"), "") && !R.accepts(rx("ε"), "a"));
  assert.strictEqual(R.sampleStrings(rx("∅"), true, 3).length, 0);
  assert(same(rx("a(a+ε)(a+ε+b)"), rx("a+aa+ab+aaa+aab")));
});
test("regex: matching", () => {
  const d = rx("a(ba*b)*a");
  assert(R.accepts(d, "aa") && R.accepts(d, "abba") && R.accepts(d, "abaaba") && !R.accepts(d, "aba"));
});
test("regex: errors are reported", () => {
  assert.throws(() => rx("a+"), /ends/);
  assert.throws(() => rx("(ab"), /parenthesis/);
  assert.throws(() => rx("ac"), /not in the alphabet/);
  assert.throws(() => rx("*a"), /nothing to repeat/);
});

test("spec: #_a(w) = 1 equals b*ab*", () => assert(same(spec("#_a(w) = 1"), rx("b*ab*"))));
test("spec: #_ab(w) = 1 equals b*aa*bb*a*", () => assert(same(spec("#_ab(w) = 1"), rx("b*aa*bb*a*"))));
test("spec: ends in aa equals (a+b)*aa", () => assert(same(spec("ends in aa"), rx("(a+b)*aa"))));
test("spec: starts with aba equals aba(a+b)*", () => assert(same(spec("w starts with aba"), rx("aba(a+b)*"))));
test("spec: each form is written one way; retired forms say what to write", () => {
  const cases = [
    ["contains bab", '"#_bab(w) > 0"'], ["#_a(w) is even", '"mod 2 = 0"'], ["|w| is odd", '"mod 2 = 1"'],
    ["|w| divisible by 3", '"mod 3 = 0"'], ["begins with ab", '"starts with"'], ["ends with ab", '"ends in"'], ["length = 2", '"|w|"'],
  ];
  for (const [src, instead] of cases) assert.throws(() => spec(src), (e) => e.message.startsWith(`Write ${instead} instead of`), src);
  try { spec("ends in a and contains bab"); assert.fail("should throw"); }
  catch (e) { assert.strictEqual("ends in a and contains bab".slice(e.from, e.to), "contains bab"); }
  assert(same(spec("#_aba(w) > 0"), spec("#aba ≥ 1")));
});
test("spec: first = last", () => assert(same(spec("first = last"), rx("ε+a+b+a(a+b)*a+b(a+b)*b"))));
test("spec: overlapping counts, brute force", () => {
  bruteforce(spec("#_aba(w) = 2"), ab, (w) => count(w, "aba") === 2);
  bruteforce(spec("#_aba(w) != 2"), ab, (w) => count(w, "aba") !== 2);
  bruteforce(spec("#_abab(w) = 1"), ab, (w) => count(w, "abab") === 1);
});
test("spec: and / or / xor / not, brute force", () => {
  bruteforce(spec("#_a(w) = 1 or #_b(w) = 1"), ab, (w) => count(w, "a") === 1 || count(w, "b") === 1);
  bruteforce(spec("#_a(w) = 1 and #_b(w) = 1"), ab, (w) => count(w, "a") === 1 && count(w, "b") === 1);
  bruteforce(spec("#_aba(w) > 0 xor #_bab(w) > 0"), ab, (w) => w.includes("aba") !== w.includes("bab"));
  bruteforce(spec("not (ends in aa) and |w| mod 2 = 0"), ab, (w) => !w.endsWith("aa") && w.length % 2 === 0);
  bruteforce(spec("|w| >= 2 and #_a(w) < 2 and first != last"), ab, (w) => w.length >= 2 && count(w, "a") < 2 && w[0] !== w[w.length - 1]);
});
test("spec: sum mod 3 = 0 over {1,2} has 3 states", () => {
  const d = spec("sum mod 3 = 0", ["1", "2"]);
  assert.strictEqual(d.n, 3);
  bruteforce(d, ["1", "2"], (w) => [...w].reduce((s, c) => s + Number(c), 0) % 3 === 0);
});
test("spec: decimal value divisible by 3", () => {
  const digits = [..."0123456789"];
  const d = spec("value mod 3 = 0", digits);
  assert(R.accepts(d, "36") && !R.accepts(d, "53") && !R.accepts(d, ""));
});
test("spec: #a = #b is refused with an explanation", () => assert.throws(() => spec("#_a(w) = #_b(w)"), /not regular/));

// ------------------------------------------------- the DFA a description explains (explainSpec)

// the strings that lead to state s of d
const reach = (d, s) => ({ ...d, accept: d.accept.map((_, i) => i === s) });

test("explained DFA: what each state of #_ab(w) = 1 means", () => {
  const e = R.explainSpec("#_ab(w) = 1", ab);
  assert.deepStrictEqual(e.names, ["q0", "q1", "q2", "q3", "dead"]);
  assert.deepStrictEqual(e.says, ["#_ab(w) = 0 and not ends in a", "#_ab(w) = 0 and ends in a", "#_ab(w) = 1 and not ends in a", "#_ab(w) = 1 and ends in a", "#_ab(w) >= 2"]);
  assert.deepStrictEqual(e.remember, [{ what: "#_ab(w)", text: "0, 1 or at least 2" }, { what: null, text: "whether w ends in `a`, which could start the next `ab`" }]);
});
test("explained DFA: starts with has a dead state; ends in and mod never die", () => {
  const st = R.explainSpec("starts with aba", ab);
  assert.strictEqual(st.says[st.names.indexOf("dead")], "starts with b or starts with aa or starts with abb");
  assert.deepStrictEqual(R.explainSpec("ends in aba", ab).says, ["not ends in a and not ends in ab", "ends in a and not ends in aba", "ends in ab", "ends in aba"]);
  assert(!R.explainSpec("#_ab(w) mod 3 = 1", ab).sink.includes("dead"));
});
test("explained DFA: hopeless combinations are one dead state, settled ones one accepting state", () => {
  const e = R.explainSpec("#_a(w) = 1 and #_b(w) = 1", ab);
  assert.deepStrictEqual(e.sink.filter(Boolean), ["dead"]);
  assert.strictEqual(e.says.at(-1), "#_a(w) >= 2 or #_b(w) >= 2");
  const found = R.explainSpec("#_aba(w) > 0", ab);
  assert.strictEqual(found.says[found.sink.indexOf("all")], "#_aba(w) >= 1");
  assert.strictEqual(found.dfa.n, 4);
});
test("explained DFA: may be larger than the smallest, never a different language", () => {
  const e = R.explainSpec("|w| > 2 and ends in b", ab);
  assert.strictEqual(e.dfa.n, 7);
  assert.strictEqual(spec("|w| > 2 and ends in b").n, 4);
  assert(same(e.dfa, spec("|w| > 2 and ends in b")));
  // counts are kept only as far as the comparisons need: >= 1 needs 0 and "at least 1"
  assert.strictEqual(R.explainSpec("#_a(w) >= 1", ab).dfa.n, 2);
});
test("explained DFA: every state description is exactly the strings that reach it", () => {
  let seed = 3;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const pick = (xs) => xs[rnd(xs.length)];
  const atoms = ["#_a(w) = 1", "#_b(w) >= 2", "#_ab(w) = 1", "#_ab(w) mod 3 = 1", "#_aba(w) > 0", "#_bb(w) < 2", "|w| > 2",
    "|w| mod 3 = 0", "starts with ab", "starts with b", "ends in ba", "ends in aab", "first = last", "first != last"];
  const gen = (d) => (d <= 0 || rnd(3) === 0 ? pick(atoms) : rnd(4) === 0 ? `not (${gen(d - 1)})` : `(${gen(d - 1)}) ${pick(["and", "or", "xor"])} (${gen(d - 1)})`);
  const descriptions = [...Array.from({ length: 150 }, () => gen(2)), "#_a(w) mod 2 = 0 and #_b(w) mod 2 = 1", "#_bb(w) > 0 and not ends in b", "#_aba(w) > 0 xor #_bab(w) > 0"];
  for (const src of descriptions) {
    const e = R.explainSpec(src, ab);
    e.says.forEach((says, s) => {
      if (says === null) return assert(e.sink[s], `${src}: ${e.names[s]} has no description`);
      assert(same(spec(says), reach(e.dfa, s)), `${src}: ${e.names[s]} is not "${says}"`);
    });
  }
  const digits = R.explainSpec("sum mod 3 = 0 and value mod 2 = 1", ["1", "2"]);
  digits.says.forEach((says, s) => assert(same(spec(says, ["1", "2"]), reach(digits.dfa, s)), says));
});

test("minimize: k-th symbol from the end needs 2^k states", () => {
  assert.strictEqual(rx("(a+b)*a(a+b)(a+b)").n, 8);
  assert.strictEqual(rx("(a+b)*a(a+b)(a+b)(a+b)").n, 16);
});

test("compare: wrong regex gets shortest counterexamples", () => {
  const r = R.compare(rx("b*ab"), spec("#_a(w) = 1"));
  assert(!r.correct);
  assert.strictEqual(r.extra, null);       // accepts nothing it should not
  assert.strictEqual(r.missing, "a");      // but misses "a"
  const r2 = R.compare(rx("(a+b)*a(a+b)*"), spec("#_a(w) = 1"));
  assert.strictEqual(r2.extra, "aa");
});

test("automaton: DFA table, missing transitions, NFA", () => {
  const p = R.parseAutomaton("start: q0\naccept: q1\nq0 b q0\nq0 a q1\nq1 b q1\nq1 a q2\nq2 a,b q2", ab);
  assert(p.deterministic && p.missing.length === 0);
  assert(same(R.nfaToDfa(p.nfa), spec("#_a(w) = 1")));

  const partial = R.parseAutomaton("start: q0\naccept: q1\nq0 b q0\nq0 a q1\nq1 b q1", ab);
  assert.deepStrictEqual(partial.missing, [["q1", "a"]]);
  assert(same(R.nfaToDfa(partial.nfa), spec("#_a(w) = 1"))); // missing moves reject

  const nfa = R.parseAutomaton("start: s\naccept: f\ns a,b s\ns a x\nx a,b y\ny a,b f", ab);
  assert(!nfa.deterministic);
  assert(same(R.nfaToDfa(nfa.nfa), rx("(a+b)*a(a+b)(a+b)")));
});

test("compare: explains which strings a wrong DFA confuses", () => {
  // forgets to distinguish "one a" from "two a's"
  const p = R.parseAutomaton("start: q0\naccept: q1\nq0 b q0\nq0 a q1\nq1 a,b q1", ab);
  const r = R.compare(R.nfaToDfa(p.nfa), spec("#_a(w) = 1"));
  assert(!r.correct && r.conflated);
  const { u, v, z, uIn, vIn } = r.conflated;
  const ref = spec("#_a(w) = 1");
  assert.notStrictEqual(R.accepts(ref, u + z), R.accepts(ref, v + z));
  assert.strictEqual(uIn, R.accepts(ref, u + z));
  assert.strictEqual(vIn, R.accepts(ref, v + z));
});

test("nerode classes: ends in aa has 3", () => {
  const cls = R.nerodeClasses(spec("ends in aa"));
  assert.deepStrictEqual(cls.map((c) => c.rep), ["", "a", "aa"]);
});

// ------------------------------------------------- error locations

test("errors: regex positions count what was typed, spaces included", () => {
  try { rx("a + c"); assert.fail("should throw"); }
  catch (e) { assert.strictEqual(e.from, 4); assert.strictEqual(e.to, 5); assert.match(e.message, /not in the alphabet/); }
  try { rx("a +  * b"); assert.fail("should throw"); }
  catch (e) { assert.match(e.message, /position 6/); assert.strictEqual(e.from, 5); }
  try { rx("(ab"); assert.fail("should throw"); }
  catch (e) { assert.strictEqual(e.from, 3); assert.strictEqual(e.to, 3); }
});
test("errors: descriptions and automata say where", () => {
  try { spec("ends in aa andd contains b"); assert.fail("should throw"); }
  catch (e) { assert.strictEqual("ends in aa andd contains b".slice(e.from, e.to), "andd"); }
  try { spec("ends in ac"); assert.fail("should throw"); }
  catch (e) { assert.strictEqual("ends in ac".slice(e.from, e.to), "ends in ac"); }
  try { spec("#a ≥ 1 ∧ zz"); assert.fail("should throw"); }
  catch (e) { assert.strictEqual("#a ≥ 1 ∧ zz".slice(e.from, e.to), "zz"); }
  try { R.parseAutomaton("start: q0\nq0 a q1\nq1 c q0", ab); assert.fail("should throw"); }
  catch (e) { assert.strictEqual(e.line, 3); assert.match(e.message, /^Line 3:/); }
  try { R.parseAutomaton("start: q0\naccept: q9\nq0 a q0", ab); assert.fail("should throw"); }
  catch (e) { assert.strictEqual(e.line, 2); }
});

// ------------------------------------------------- feedback (check.ts)

const lang = (src, alpha = "a b") => R.readLanguage(alpha, src);
const check = (mode, src, L) => R.checkAnswer(R.readAnswer(mode, src, L.alphabet), L);

test("feedback: verdicts", () => {
  const L = lang("#_a(w) = 1");
  assert.strictEqual(check("regex", "b*ab*", L).verdict, "correct");
  assert.strictEqual(check("regex", "b*ab", L).verdict, "too-strict");
  assert.strictEqual(check("regex", "(a+b)*a(a+b)*", L).verdict, "too-generous");
  const both = check("regex", "a+bb", L);
  assert.strictEqual(both.verdict, "both");
  assert.strictEqual(both.extra, "bb");
  assert.strictEqual(both.missing, "ab");
});
test("feedback: wrong DFA names the shared state", () => {
  const f = check("automaton", "start: q0\naccept: q1\nq0 b q0\nq0 a q1\nq1 a,b q1", lang("#_a(w) = 1"));
  assert(f.conflated && f.conflated.stateName === "q1");
  assert.strictEqual(f.conflated.studentState, 1); // q1 is the second state written
});
test("feedback: partial DFA counts the implied dead state", () => {
  const f = check("automaton", "start: q0\naccept: q1\nq0 b q0\nq0 a q1\nq1 b q1", lang("#_a(w) = 1"));
  assert(f.correct);
  assert.deepStrictEqual(f.missingMoves, [["q1", "a"]]);
  assert.deepStrictEqual({ ...f.states, mergeable: undefined }, { written: 2, impliedDead: true, total: 3, min: 3, mergeable: undefined, unreachable: [] });
});
test("feedback: mergeable and unreachable states", () => {
  const f = check("automaton", "start: p\naccept: q r\np b p\np a q\nq b r\nr b q\nq a d\nr a d\nd a,b d\nz a,b z", lang("#_a(w) = 1"));
  assert(f.correct);
  assert.strictEqual(f.states.total, 5);
  assert.deepStrictEqual(f.states.mergeable, [["q", "r"]]);
  assert.deepStrictEqual(f.states.unreachable, ["z"]);
});
test("feedback: NFA note and probe path", () => {
  // descriptions cannot say "third from the end", so this language is built directly
  const L = { alphabet: ab, dfa: rx("(a+b)*a(a+b)(a+b)"), text: "" };
  const ans = R.readAnswer("automaton", "start: s\naccept: f\ns a,b s\ns a x\nx a,b y\ny a,b f", L.alphabet);
  const f = R.checkAnswer(ans, L);
  assert(f.correct && f.nfa && f.states === null);
  const p = R.probe("a b a b", L, ans);
  assert.strictEqual(p.input, "abab");
  assert(!p.inLanguage && p.accepted === false);
  assert.deepStrictEqual(p.path.map((s) => s.states.map((i) => ans.model.names[i]).join(",")), ["s", "s,x", "s,y", "s,x,f", "s,y"]);
  assert.strictEqual(R.probe("abc", L, ans).foreign, "c");
});
test("hints: what to remember, the states with their meaning, then the smallest DFA", () => {
  const h = R.hints(lang("|w| > 2 and ends in b"));
  assert.deepStrictEqual(h.remember.map((r) => r.what), ["|w|", null]);
  assert.strictEqual(h.dfa.names.length, 7);
  assert.deepStrictEqual(h.states.slice(0, 2).map((s) => [s.name, s.says, s.example, s.start]), [
    ["q0", "|w| = 0", "", true], ["q1", "|w| = 1 and not ends in b", "a", false],
  ]);
  assert(h.states.at(-1).accepting && h.states.at(-1).says === "|w| >= 3 and ends in b");
  // the smallest DFA merges the states that no string tells apart
  assert.strictEqual(h.smallest.names.length, 4);
  assert.deepStrictEqual(h.merged.map((m) => m.join(" ")), ["q0", "q1 q2", "q3 q4 q5", "q6"]);
  assert(same(rx(h.regex), spec("|w| > 2 and ends in b")));
  // the dead state comes last, named as such
  assert.deepStrictEqual(R.hints(lang("#_a(w) = 1")).states.map((s) => [s.name, s.sink]), [["q0", null], ["q1", null], ["dead", "dead"]]);
});
test("draft: draws what can be read so far, numbered like the checked answer", () => {
  const d = R.draftAutomaton("start: q0\naccept: q2\nq0 a q1\nq1 b\nq9", ab);
  assert.deepStrictEqual(d.model.names, ["q0", "q1", "q2"]);
  assert.deepStrictEqual(d.model.accept, [false, false, true]);
  assert.deepStrictEqual(d.skipped, [4, 5]);
  assert.strictEqual(d.kind, "dfa");
  assert.strictEqual(R.draftAutomaton("start: q0\nq0 a q1\nq0 a q2", ab).kind, "nfa");
  assert.strictEqual(R.draftAutomaton("accept: q1\nq0 a q1", ab).model, null);
  // the template the answer editor starts with is one state, nothing accepted yet
  assert.deepStrictEqual(R.draftAutomaton("start: q0\naccept: \n", ab).model.names, ["q0"]);
  const text = "start: s\naccept: f\ns a,b s\ns a x\nx a,b y\ny a,b f";
  const answer = R.readAnswer("automaton", text, ab);
  assert.deepStrictEqual(R.draftAutomaton(text, ab).model, answer.model);
});
test("errors: readLanguage and readAnswer say which field", () => {
  assert.throws(() => lang("ends in aa", "a ("), (e) => e.field === "alphabet");
  assert.throws(() => lang("ends in zz"), (e) => e.field === "language");
  assert.throws(() => R.readAnswer("regex", "a+", ab), (e) => e.field === "answer");
});

test("solution regex: describes exactly the language", () => {
  for (const s of ["#_a(w) = 1", "#_ab(w) = 1", "ends in aa", "first = last", "#_aba(w) > 0 xor #_bab(w) > 0", "#_a(w) mod 2 = 0 and #_b(w) mod 2 = 1"]) {
    const d = spec(s);
    assert(same(rx(R.dfaToRegex(d)), d), s);
  }
  assert.strictEqual(R.dfaToRegex(spec("#_a(w) = 1")), "b*ab*");
  assert.strictEqual(R.dfaToRegex(rx("∅")), "∅");
  assert.strictEqual(R.dfaToRegex(rx("ε")), "ε");
  assert.strictEqual(R.dfaToRegex(rx("(a+b)*")), "(a+b)*");
  const d = spec("sum mod 3 = 0", ["1", "2"]);
  assert(R.compare(R.regexToDfa(R.dfaToRegex(d), ["1", "2"]), d).correct);
});
test("solution regex: hints carry the regex", () => {
  assert.strictEqual(R.hints(lang("#_a(w) = 1")).regex, "b*ab*");
});

// ------------------------------------------------- converters (check.ts)

test("regex to NFA: built by induction, start state 0, same language", () => {
  const sizes = { "a": 2, "ε": 1, "∅": 1, "a+b": 5, "ab": 4, "a*": 3, "(a+b)*aa": 10, "(a+b)*a(a+b)(a+b)": 18 };
  for (const [src, n] of Object.entries(sizes)) {
    const nfa = R.regexToNfa(R.parseRegex(src, ab), ab);
    assert.strictEqual(nfa.n, n, src);
    assert.strictEqual(nfa.start, 0, src);
    assert(same(R.nfaToDfa(nfa), rx(src)), src);
  }
});
test("convertRegex: NFA, subset DFA and smallest DFA", () => {
  const c = R.convertRegex("a b", "(a+b)*aa");
  assert.strictEqual(c.nfa.names.length, 10);
  assert(c.nfa.edges.some((e) => e.symbols.includes("ε")));
  // the subset DFA names its states by letter, and each stands for a set of NFA states
  assert.deepStrictEqual(c.dfa.names, ["A", "B", "C", "D"]);
  assert.strictEqual(c.subsets.length, 4);
  assert(c.subsets[0].includes("q0"));
  assert.strictEqual(c.minimal.names.length, 3);
  assert.deepStrictEqual(c.merged.map((m) => m.join(" ")), ["A C", "B", "D"]);
  assert.deepStrictEqual(c.samples.yes.slice(0, 2), ["aa", "aaa"]);
  // the empty set is drawn as ∅, a dead state
  const d = R.convertRegex("a b", "ab");
  assert(d.dfa.names.includes("∅"));
  assert.deepStrictEqual(d.subsets[d.dfa.names.indexOf("∅")], []);
});
test("convertAutomaton: regex for the language, kind", () => {
  const nfa = "start: q0\naccept: q2\nq0 a,b q0\nq0 a q1\nq1 b q2";
  const c = R.convertAutomaton("a b", nfa);
  assert.strictEqual(c.kind, "nfa");
  assert.strictEqual(c.minStates, 3);
  // eliminating from the NFA as written follows its structure
  assert.strictEqual(c.regex, "(a+b)*ab");
  assert.strictEqual(c.eliminatedFrom, "automaton");
  assert.strictEqual(R.convertAutomaton("a b", "start: e\naccept: e\ne a o\no a e\ne b e\no b o").kind, "dfa");
});
test("nfaToRegex: exact on NFAs built from random expressions", () => {
  let seed = 11;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const gen = (d) => {
    const k = d <= 0 ? rnd(3) : rnd(8);
    if (k === 0) return "a"; if (k === 1) return "b"; if (k === 2) return rnd(4) ? "a" : "ε";
    if (k <= 4) return `(${gen(d - 1)}+${gen(d - 1)})`;
    if (k <= 6) return `${gen(d - 1)}${gen(d - 1)}`;
    return `(${gen(d - 1)})*`;
  };
  for (let i = 0; i < 300; i++) {
    const src = gen(3);
    assert(same(rx(R.nfaToRegex(R.regexToNfa(R.parseRegex(src, ab), ab))), rx(src)), src);
  }
});
test("converters: automatonText round-trips, and errors name the field", () => {
  for (const src of ["(a+b)*a(a+b)(a+b)", "a*b*", "∅", "ε", "(ab+ba)*"]) {
    const c = R.convertRegex("a b", src);
    for (const m of [c.nfa, c.dfa, c.minimal]) assert(same(rx(R.convertAutomaton("a b", R.automatonText(m)).regex), rx(src)), src);
  }
  assert.throws(() => R.convertRegex("a b", "a+"), (e) => e.field === "input");
  assert.throws(() => R.convertRegex("a (", "a"), (e) => e.field === "alphabet");
  assert.throws(() => R.convertAutomaton("a b", "start: q0\nq0 c q0"), (e) => e.field === "input" && e.line === 2);
});

console.log(`\n${passed} passed`);
