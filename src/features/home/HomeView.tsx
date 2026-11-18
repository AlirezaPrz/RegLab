/** The landing page: what RegLab is, its tools, how the regular-languages tool works, and the BIG RESULT. */
import { useMemo, type ReactNode } from "react";
import { convertAutomaton, hints, readLanguage, type AutomatonModel } from "../../engine/index.ts";
import { Diagram } from "../../diagram/LazyDiagram.tsx";
import { Definition, TypesetRegex } from "../../ui/Typeset.tsx";
import { HowItWorks } from "./HowItWorks.tsx";
import "./home.css";

// an NFA for (a+b)*ab, drawn in the converter's tile
const TILE_NFA = "start: q0\naccept: q2\nq0 a,b q0\nq0 a q1\nq1 b q2";

/** One tool: its name, what it does, and a small engine-drawn example of what it works with. */
function ToolTile({ name, what, href, formula, model, title }: {
  name: string; what: string; href: string; formula: ReactNode; model: AutomatonModel; title: string;
}) {
  return (
    <li className="tool-tile">
      <a href={href} className="tool-link">
        <span className="tool-text">
          <span className="tool-name">{name}</span>
          <span className="tool-what">{what}</span>
          <span className="tool-open">Open <span aria-hidden="true">→</span></span>
        </span>
        <span className="tool-figure">
          <span className="tool-formula">{formula}</span>
          <Diagram model={model} title={title} bare />
        </span>
      </a>
    </li>
  );
}

/** The landing page. */
export function HomeView() {
  // real engine output for the tiles: the smallest DFA for a description, and an NFA as written
  const dfa = useMemo(() => hints(readLanguage("a b", "ends in aa")).dfa, []);
  const nfa = useMemo(() => convertAutomaton("a b", TILE_NFA).model, []);

  return (
    <div className="home">
      <section className="home-hero" aria-labelledby="home-h">
        <h1 id="home-h" className="home-title">A workbench for the<br />theory of computation.</h1>
        <p className="home-lede">
          Write an answer and RegLab tells you whether it is right. When it is not, you get the exact string where it breaks
          and why. No account and no setup.
        </p>
      </section>

      <section className="home-tools" aria-labelledby="tools-h">
        <h2 id="tools-h" className="home-h2">Tools</h2>
        <ul className="tools">
          <ToolTile name="Regular Languages" href="#/regular"
            what="Describe a language and answer with a regular expression, DFA or NFA. See the shortest string your answer gets wrong, which strings it confuses, and hints that stop short of the answer."
            formula={<Definition alphabet={["a", "b"]} text="ends in aa" />}
            model={dfa} title="Example: the smallest DFA for strings ending in aa" />
          <ToolTile name="Regex ⇄ Automata" href="#/convert"
            what="Turn a regular expression into an NFA, the DFA the subset construction makes from it, and the smallest DFA. Or turn a DFA or NFA into a regular expression."
            formula={<span className="math"><i>R</i> <span className="m-op">=</span> <TypesetRegex text="(a+b)*ab" /></span>}
            model={nfa} title="Example: an NFA for (a+b)*ab" />
        </ul>
      </section>

      <HowItWorks />

      <section className="home-result" aria-labelledby="result-h">
        <div className="result-inner">
          <h2 id="result-h" className="result-h">The BIG RESULT</h2>
          <div className="theorem math">
            <p><strong>Theorem.</strong> Let <i>L</i> be a language. Then the following are equivalent:</p>
            <ol>
              <li><i>L</i> <span className="m-op">=</span> <i>L</i>(<i>R</i>) for some regex <i>R</i></li>
              <li><i>L</i> <span className="m-op">=</span> <i>L</i>(<i>M</i>) for some DFA <i>M</i></li>
              <li><i>L</i> <span className="m-op">=</span> <i>L</i>(<i>M</i>) for some NFA <i>M</i></li>
            </ol>
          </div>
          <p className="result-note">
            Both tools are built on it. The regular-languages tool turns every answer into a DFA, so any two answers can be
            compared exactly. <a href="#/convert">Regex ⇄ Automata</a> runs the constructions from its proof: regex to NFA, NFA to DFA,
            and back to a regex.
          </p>
        </div>
      </section>

      {/* the page ends on the name, cropped by the bottom edge */}
      <footer className="home-foot">
        <p className="home-foot-name" aria-hidden="true">RegLab</p>
      </footer>
    </div>
  );
}
