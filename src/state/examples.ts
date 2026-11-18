/**
 * The example languages offered in the language picker; the first is the default. Some have a hint
 * DFA that is already the smallest, and some (ends in ab or bb, the two with lengths) have states the
 * smallest DFA merges, so the last hint has something to show.
 */
export interface Example { name: string; alphabet: string; text: string }

export const EXAMPLES: Example[] = [
  { name: "Exactly one a", alphabet: "a b", text: "#_a(w) = 1" },
  { name: "The substring ab appears exactly once", alphabet: "a b", text: "#_ab(w) = 1" },
  { name: "Ends in aa", alphabet: "a b", text: "ends in aa" },
  { name: "Ends in ab or in bb", alphabet: "a b", text: "ends in ab or ends in bb" },
  { name: "Even number of a's and odd number of b's", alphabet: "a b", text: "#_a(w) mod 2 = 0 and #_b(w) mod 2 = 1" },
  { name: "Length at least 2, first and last the same", alphabet: "a b", text: "|w| >= 2 and first = last" },
  { name: "Digits that sum to a multiple of 3", alphabet: "1 2", text: "sum mod 3 = 0" },
  { name: "Length at least 3, ending in b", alphabet: "a b", text: "|w| > 2 and ends in b" },
];
