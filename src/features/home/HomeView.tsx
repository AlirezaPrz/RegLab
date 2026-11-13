/** The landing page: what RegLab is, the tools (available and planned), and the BIG RESULT. */
import { useMemo } from "react";
import { hints, readLanguage } from "../../engine/index.ts";
import { Diagram } from "../../diagram/LazyDiagram.tsx";
import { HowItWorks } from "./HowItWorks.tsx";
import "./home.css";


/** The tools, in the order the course meets them. `href` only for tools that exist. */
const TOOLS: { name: string; what: string; href?: string }[] = [
  { name: "Regular languages", what: "Check a regular expression, DFA or NFA against a language. See the shortest string it gets wrong, which strings it confuses, and hints that stop short of the answer.", href: "#/regular" },
  { name: "NFA to DFA, step by step", what: "Watch the subset construction build each state, then try the next step yourself." },
  { name: "Context-free grammars", what: "Test a grammar on strings and see their derivations and parse trees." },
  { name: "Pushdown automata", what: "Write a PDA as transitions and trace a string through its stack." },
  { name: "Pumping lemmas", what: "Play the pumping-lemma game: pick the split, and see why it fails." },
  { name: "Practice problems", what: "New languages to describe, checked the moment you answer." },
];

/** The landing page. */
export function HomeView() {
  // a real minimal DFA from the engine, drawn in the regular-languages tile
  const preview = useMemo(() => hints(readLanguage("a b", "spec", "ends in aa")).solution, []);
  const [live, ...planned] = TOOLS;

  return (
    <div className="home">
      <section className="home-hero" aria-labelledby="home-h">
        <h1 id="home-h" className="home-title">A workbench for the<br />theory of computation.</h1>
        <p className="home-lede">
          Write an answer and RegLab tells you whether it is right. When it is not, you get the exact string where it breaks
          and why. No account and no setup.
        </p>
        <a className="home-cta" href={live.href}>Open {live.name.toLowerCase()}</a>
      </section>

      <section className="home-tools" aria-labelledby="tools-h">
        <h2 id="tools-h" className="home-h2">Tools</h2>
        <ul className="tools">
          <li className="tool-live">
            <a href={live.href} className="tool-live-link">
              <span className="tool-live-text">
                <span className="tool-name">{live.name}</span>
                <span className="tool-what">{live.what}</span>
                <span className="tool-open">Open the tool <span aria-hidden="true">→</span></span>
              </span>
              <span className="tool-live-figure">
                <Diagram model={preview} title="Example: the smallest DFA for strings ending in aa" bare />
              </span>
            </a>
          </li>
          {planned.map((t) => (
            <li key={t.name} className="tool-planned">
              <span className="tool-name">{t.name}</span>
              <span className="tool-what">{t.what}</span>
              <span className="tool-status">Planned</span>
            </li>
          ))}
        </ul>
      </section>

      <HowItWorks />

      <section className="home-result" aria-labelledby="result-h">
        <div className="result-inner">
        <div className="result-body">
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
            The regular-languages tool is built on it: every regular expression and NFA you enter becomes a DFA, and two DFAs can
            always be compared exactly.
          </p>
        </div>
        </div>
      </section>

      {/* the page ends on the name, cropped by the bottom edge */}
      <footer className="home-foot">
        <p className="home-foot-name" aria-hidden="true">RegLab</p>
      </footer>
    </div>
  );
}
