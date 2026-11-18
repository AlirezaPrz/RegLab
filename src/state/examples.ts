/** The example languages offered in the language picker; the first is the default. */
export interface Example { name: string; alphabet: string; text: string }

export const EXAMPLES: Example[] = [
  { name: "Exactly one a", alphabet: "a b", text: "#_a(w) = 1" },
  { name: "The substring ab appears exactly once", alphabet: "a b", text: "#_ab(w) = 1" },
  { name: "Ends in aa", alphabet: "a b", text: "ends in aa" },
  { name: "First and last symbols are the same", alphabet: "a b", text: "first = last" },
  { name: "Even number of a's and odd number of b's", alphabet: "a b", text: "#_a(w) mod 2 = 0 and #_b(w) mod 2 = 1" },
  { name: "Contains aba or bab, but not both", alphabet: "a b", text: "#_aba(w) > 0 xor #_bab(w) > 0" },
  { name: "Digits that sum to a multiple of 3", alphabet: "1 2", text: "sum mod 3 = 0" },
  { name: "Contains bb but does not end in b", alphabet: "a b", text: "#_bb(w) > 0 and not ends in b" },
];
