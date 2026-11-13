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
test("spec: contains equals count >= 1", () => assert(same(spec("contains aba"), spec("#aba ≥ 1"))));
test("spec: first = last", () => assert(same(spec("first = last"), rx("ε+a+b+a(a+b)*a+b(a+b)*b"))));
test("spec: overlapping counts, brute force", () => {
  bruteforce(spec("#_aba(w) = 2"), ab, (w) => count(w, "aba") === 2);
  bruteforce(spec("#_aba(w) != 2"), ab, (w) => count(w, "aba") !== 2);
  bruteforce(spec("#_abab(w) = 1"), ab, (w) => count(w, "abab") === 1);
});
test("spec: and / or / xor / not, brute force", () => {
  bruteforce(spec("#_a(w) = 1 or #_b(w) = 1"), ab, (w) => count(w, "a") === 1 || count(w, "b") === 1);
  bruteforce(spec("#_a(w) = 1 and #_b(w) = 1"), ab, (w) => count(w, "a") === 1 && count(w, "b") === 1);
  bruteforce(spec("contains aba xor contains bab"), ab, (w) => w.includes("aba") !== w.includes("bab"));
  bruteforce(spec("not (ends in aa) and |w| is even"), ab, (w) => !w.endsWith("aa") && w.length % 2 === 0);
});
test("spec: sum divisible by 3 over {1,2} has 3 states", () => {
  const d = spec("sum divisible by 3", ["1", "2"]);
  assert.strictEqual(d.n, 3);
  bruteforce(d, ["1", "2"], (w) => [...w].reduce((s, c) => s + Number(c), 0) % 3 === 0);
});
test("spec: decimal value divisible by 3", () => {
  const digits = [..."0123456789"];
  const d = spec("value divisible by 3", digits);
  assert(R.accepts(d, "36") && !R.accepts(d, "53") && !R.accepts(d, ""));
});
test("spec: #a = #b is refused with an explanation", () => assert.throws(() => spec("#_a(w) = #_b(w)"), /not a regular language/));

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

const lang = (src, mode = "spec", alpha = "a b") => R.readLanguage(alpha, mode, src);
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
  const L = lang("(a+b)*a(a+b)(a+b)", "regex");
  const ans = R.readAnswer("automaton", "start: s\naccept: f\ns a,b s\ns a x\nx a,b y\ny a,b f", L.alphabet);
  const f = R.checkAnswer(ans, L);
  assert(f.correct && f.nfa && f.states === null);
  const p = R.probe("a b a b", L, ans);
  assert.strictEqual(p.input, "abab");
  assert(!p.inLanguage && p.accepted === false);
  assert.deepStrictEqual(p.path.map((s) => s.states.map((i) => ans.model.names[i]).join(",")), ["s", "s,x", "s,y", "s,x,f", "s,y"]);
  assert.strictEqual(R.probe("abc", L, ans).foreign, "c");
});
test("feedback: hints match the minimal DFA", () => {
  const h = R.hints(lang("ends in aa"));
  assert.strictEqual(h.minStates, 3);
  assert.strictEqual(h.solution.names.length, 3);
  assert.deepStrictEqual(h.solution.edges.find((e) => e.from === 2 && e.to === 2).symbols, ["a"]);
});
test("errors: readLanguage and readAnswer say which field", () => {
  assert.throws(() => lang("ends in aa", "spec", "a ("), (e) => e.field === "alphabet");
  assert.throws(() => lang("ends in zz"), (e) => e.field === "language");
  assert.throws(() => R.readAnswer("regex", "a+", ab), (e) => e.field === "answer");
});

test("solution regex: describes exactly the language", () => {
  for (const s of ["#_a(w) = 1", "#_ab(w) = 1", "ends in aa", "first = last", "contains aba xor contains bab", "#_a(w) is even and #_b(w) is odd"]) {
    const d = spec(s);
    assert(same(rx(R.dfaToRegex(d)), d), s);
  }
  assert.strictEqual(R.dfaToRegex(spec("#_a(w) = 1")), "b*ab*");
  assert.strictEqual(R.dfaToRegex(rx("∅")), "∅");
  assert.strictEqual(R.dfaToRegex(rx("ε")), "ε");
  assert.strictEqual(R.dfaToRegex(rx("(a+b)*")), "(a+b)*");
  const d = spec("sum divisible by 3", ["1", "2"]);
  assert(R.compare(R.regexToDfa(R.dfaToRegex(d), ["1", "2"]), d).correct);
});
test("solution regex: hints give the reference regex when there is one", () => {
  assert.strictEqual(R.hints(R.readLanguage("a b", "regex", "(a + b)*a")).regex, "(a+b)*a");
  assert.strictEqual(R.hints(R.readLanguage("a b", "spec", "#_a(w) = 1")).regex, "b*ab*");
});

console.log(`\n${passed} passed`);
