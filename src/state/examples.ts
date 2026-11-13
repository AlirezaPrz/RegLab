/** The example languages offered in the language picker; the first is the default. */
import type { LanguageSource } from "../engine/index.ts";

export interface Example { name: string; alphabet: string; source: LanguageSource; text: string }

export const EXAMPLES: Example[] = [
  { name: "Exactly one a", alphabet: "a b", source: "spec", text: "#_a(w) = 1" },
  { name: "The substring ab appears exactly once", alphabet: "a b", source: "spec", text: "#_ab(w) = 1" },
  { name: "Ends in aa", alphabet: "a b", source: "spec", text: "ends in aa" },
  { name: "First and last symbols are the same", alphabet: "a b", source: "spec", text: "first = last" },
  { name: "Even number of a's and odd number of b's", alphabet: "a b", source: "spec", text: "#_a(w) is even and #_b(w) is odd" },
  { name: "Contains aba or bab, but not both", alphabet: "a b", source: "spec", text: "contains aba xor contains bab" },
  { name: "Digits that sum to a multiple of 3", alphabet: "1 2", source: "spec", text: "sum divisible by 3" },
  { name: "Third symbol from the end is a", alphabet: "a b", source: "regex", text: "(a+b)*a(a+b)(a+b)" },
];
