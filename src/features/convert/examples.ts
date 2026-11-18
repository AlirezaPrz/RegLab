/** The converter's examples, over {a, b}; the first of each list is the default. */

export const REGEX_EXAMPLES = ["(a+b)*aa", "a*b*", "(ab+ba)*", "(a+b)*a(a+b)(a+b)", "b*(ab*ab*)*"];

export const AUTOMATON_EXAMPLES: { name: string; text: string }[] = [
  { name: "NFA: ends in ab", text: "start: q0\naccept: q2\nq0 a,b q0\nq0 a q1\nq1 b q2" },
  { name: "NFA with ε-moves", text: "start: p\naccept: r\np a p\np ε q\nq b q\nq ε r\nr a r" },
  { name: "DFA: even number of a's", text: "start: even\naccept: even\neven b even\neven a odd\nodd b odd\nodd a even" },
  { name: "DFA: no aa", text: "start: s\naccept: s t\ns b s\ns a t\nt b s\nt a dead\ndead a,b dead" },
];
