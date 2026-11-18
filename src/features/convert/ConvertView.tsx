/** The regex ⇄ automata converter: one direction at a time, each keeping its own draft. */
import { useId, useState } from "react";
import { Segmented } from "../../ui/Segmented.tsx";
import { RegexToAutomata } from "./RegexToAutomata.tsx";
import { AutomatonToRegex } from "./AutomatonToRegex.tsx";
import { AUTOMATON_EXAMPLES, REGEX_EXAMPLES } from "./examples.ts";
import "./convert.css";

/** What was typed in one direction: the alphabet and the regex or automaton. */
export interface Draft { alphabet: string; text: string }

type Direction = "to-automata" | "to-regex";

export function ConvertView() {
  const headingId = useId();
  const [dir, setDir] = useState<Direction>("to-automata");
  const [regex, setRegex] = useState<Draft>({ alphabet: "a b", text: REGEX_EXAMPLES[0] });
  const [automaton, setAutomaton] = useState<Draft>({ alphabet: "a b", text: AUTOMATON_EXAMPLES[0].text });

  // "Convert this back" fills the other direction and switches to it, at the top of the page
  const switchTo = (next: Direction) => {
    setDir(next);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  const switcher = (
    <div className="lang-head">
      <h2 id={headingId} className="h-section">Convert</h2>
      <Segmented labelledBy={headingId} value={dir} onChange={setDir}
        options={[{ value: "to-automata", label: "Regex → automata" }, { value: "to-regex", label: "Automaton → regex" }]} />
    </div>
  );

  return dir === "to-automata"
    ? <RegexToAutomata switcher={switcher} draft={regex} onChange={setRegex}
        onConvertBack={(text) => { setAutomaton({ alphabet: regex.alphabet, text }); switchTo("to-regex"); }} />
    : <AutomatonToRegex switcher={switcher} draft={automaton} onChange={setAutomaton}
        onConvertBack={(text) => { setRegex({ alphabet: automaton.alphabet, text }); switchTo("to-automata"); }} />;
}
