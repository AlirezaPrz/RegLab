# RegLab

A self-serve practice tool for regular languages (CSCB36, Introduction to the Theory of Computation). It has two tools:

- **Regular Languages:** describe a language, answer with a regular expression, DFA or NFA, and find out whether the answer is right and, if not, exactly where it goes wrong.
- **Regex ⇄ Automata:** turn a regular expression into an NFA, the DFA the subset construction makes from it, and the smallest DFA; or turn a DFA or NFA into a regular expression.

It is a static site with no backend.

## Running it

Needs Node 24 or newer (the tests run the TypeScript engine directly).

```sh
npm install
npm run dev        # local dev server
npm test           # engine tests (node test.js)
npm run build      # type-check, then build into dist/
npm run preview    # serve dist/ locally
```

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` runs the tests, builds the site and publishes it on every push to `main`. In the repository, open Settings → Pages and set the source to **GitHub Actions**. The build uses relative paths, so it works at `https://<user>.github.io/<repo>/`.

## How the code is organised

```
src/
  engine/       all automata logic, no DOM, no dependencies
    engine.ts     regex/description/automaton parsing, regex to NFA, subset construction, minimisation,
                  comparison, state elimination (automaton to regex), and explainSpec: the DFA a
                  description defines, built from what it tracks, with what each state means
    check.ts      what the UI shows, as plain data: readLanguage, readAnswer, checkAnswer, probe, hints,
                  draftAutomaton (the drawing while typing), and for the converter convertRegex,
                  convertAutomaton, automatonText
  state/        useWorkbench: the study session (language → answer → feedback → probe)
  features/
    home/       the landing page (#/): what RegLab is, the tools, a scroll walkthrough of the
                regular-languages tool (HowItWorks), and the BIG RESULT
    check/      the regular-languages tool (#/regular; #/check still works); StuckSection is the hints
    convert/    the regex ⇄ automata converter (#/convert)
  diagram/      dagre layout (layout.ts) and the SVG / table renderer
  ui/           small shared pieces: symbol keys, the automaton editor, field errors, typeset notation, icons
  styles/       tokens.css (light and dark themes) and app.css
src/assets/fonts/  a subset of STIX Two Math for operators (SIL OFL 1.1, licence alongside)
test.js         engine tests
```

Rules worth keeping:

- **The engine is the only place that knows about automata.** Components render what `check.ts` returns. If the UI needs a new fact, add a function to `check.ts` and a test to `test.js`.
- **Errors carry their location.** `EngineError` has `from`/`to` (character range in the typed text) or `line` (automata). `FieldError` shows them under the input.
- **The solution is gated.** The hints form a ladder that opens in place, one rung at a time: what to remember, what each state means, the full solution (which asks first), and the smallest DFA, which appears only when merging really makes it smaller. They never say how many states there are, since that is a hint in itself. Everything closes whenever the language changes (`languageChanged` in `useWorkbench.ts`).
- **State descriptions are checked, not trusted.** `explainSpec` describes each state in the description syntax, so `test.js` parses every description back and checks it is exactly the set of strings that reach that state. Keep new trackers to that rule.
- **Each description form is written one way.** Retired forms (`contains`, `is even`, `divisible by`, `begins with`, `ends with`, `length`) are rejected with an error that names the form to use; add a `retired(...)` line in `parseDescription` rather than a synonym.

## Adding the planned features

- **New tools** (for example an NFA-to-DFA step-through, context-free grammars, pushdown automata, a pumping-lemma game, practice problems): add a folder under `src/features/`, an entry in `VIEWS` in `src/App.tsx` (its header link, named for what it covers), and a `ToolTile` for it in `src/features/home/HomeView.tsx`.
- **Diagrams**: `Diagram` (from `src/diagram/LazyDiagram.tsx`) takes an `AutomatonModel` (`names`, `start`, `accept`, `edges`) plus `active` and `marked` state sets, so a step-through can highlight subsets as it goes. The layout library is confined to `src/diagram/layout.ts`.
- **Drag-and-drop editor**: produce the same `{ start, accept, edges }` shape the text format parses into (`ParsedAutomaton` / `AutomatonModel`) and add it as another answer source next to the text editor in `AnswerPanel`.
