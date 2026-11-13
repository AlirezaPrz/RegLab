# RegLab

A self-serve practice tool for regular languages (CSCB36, Introduction to the Theory of Computation). Describe a language, answer with a regular expression, DFA or NFA, and find out whether the answer is right and, if not, exactly where it goes wrong.

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
    engine.ts     regex/description/automaton parsing, subset construction, minimisation, comparison, DFA to regex
    check.ts      what the UI shows, as plain data: readLanguage, readAnswer, checkAnswer, probe, hints
  state/        useWorkbench: the study session (language → answer → feedback → probe)
  features/
    home/       the landing page (#/): what RegLab is, the tools, a scroll walkthrough of the
                regular-languages tool (HowItWorks), and the BIG RESULT
    check/      the regular-languages tool (#/regular; #/check still works)
  diagram/      dagre layout (layout.ts) and the SVG / table renderer
  ui/           small shared pieces: symbol keys, field errors, typeset notation, icons
  styles/       tokens.css (light and dark themes) and app.css
src/assets/fonts/  a subset of STIX Two Math for operators (SIL OFL 1.1, licence alongside)
prototype/      the original vanilla-JS prototype and engine, kept for reference
test.js         engine tests
```

Rules worth keeping:

- **The engine is the only place that knows about automata.** Components render what `check.ts` returns. If the UI needs a new fact, add a function to `check.ts` and a test to `test.js`.
- **Errors carry their location.** `EngineError` has `from`/`to` (character range in the typed text) or `line` (automata). `FieldError` shows them under the input.
- **The solution is gated.** Hints open one step at a time; the full solution needs a second, confirmed action and closes whenever the language changes (`languageChanged` in `useWorkbench.ts`).

## Adding the planned features

- **New tools** (NFA-to-DFA step-through, context-free grammars, pushdown automata, pumping-lemma game, practice problems): add a folder under `src/features/`, an entry in `VIEWS` in `src/App.tsx` (its header link, named for what it covers), and an `href` on its tile in `TOOLS` in `src/features/home/HomeView.tsx` so it stops showing "Planned".
- **Diagrams**: `Diagram` (from `src/diagram/LazyDiagram.tsx`) takes an `AutomatonModel` (`names`, `start`, `accept`, `edges`) plus `active` and `marked` state sets, so a step-through can highlight subsets as it goes. The layout library is confined to `src/diagram/layout.ts`.
- **Drag-and-drop editor**: produce the same `{ start, accept, edges }` shape the text format parses into (`ParsedAutomaton` / `AutomatonModel`) and add it as another answer source next to the text editor in `AnswerPanel`.
