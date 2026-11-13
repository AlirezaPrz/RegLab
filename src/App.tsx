/** The app shell: the header, the page router (URL hash) and the light/dark theme. */
import { useEffect, useState, type ComponentType } from "react";
import { CheckView } from "./features/check/CheckView.tsx";
import { Icon } from "./ui/Icon.tsx";

/**
 * Pages, in header order. The first is the landing page. Each tool gets its own entry named for
 * what it covers (later: "Context-free grammars", "Pushdown automata", ...), so the header reads
 * as a map of the course rather than a list of generic "checkers".
 */
const VIEWS: { id: string; nav: string; title: string; Component: ComponentType; ownHeading?: boolean; aliases?: string[] }[] = [
  { id: "regular", nav: "Regular languages", title: "Regular languages: check an answer", Component: CheckView, aliases: ["check"] },
];

const hrefOf = (id: string) => (id ? `#/${id}` : "#/");

type Theme = "auto" | "light" | "dark";
const NEXT: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };
const THEME_LABEL: Record<Theme, string> = { auto: "Theme: match system", light: "Theme: light", dark: "Theme: dark" };

/** The theme choice, applied as data-theme on <html> and remembered in localStorage (index.html applies it before first paint). */
function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const t = localStorage.getItem("reglab-theme"); return t === "light" || t === "dark" ? t : "auto"; } catch { return "auto"; }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme; else root.dataset.theme = theme;
    try { if (theme === "auto") localStorage.removeItem("reglab-theme"); else localStorage.setItem("reglab-theme", theme); } catch { /* storage unavailable */ }
  }, [theme]);
  return [theme, () => setTheme((t) => NEXT[t])];
}

function readView() {
  const id = window.location.hash.replace(/^#\/?/, "");
  return VIEWS.find((v) => v.id === id || v.aliases?.includes(id)) ?? VIEWS[0];
}

/** The current page, from the URL hash. Hash routing keeps the site static, so it works on GitHub Pages. */
function useHashView() {
  const [view, setView] = useState(readView);
  useEffect(() => {
    const on = () => {
      const next = readView();
      setView((cur) => { if (cur !== next) window.scrollTo(0, 0); return next; });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => { document.title = view.id ? `${view.nav} · RegLab` : "RegLab"; }, [view]);
  return view;
}

/** The root component. */
export function App() {
  const [theme, cycleTheme] = useTheme();
  const view = useHashView();
  const { Component } = view;
  return (
    <div className={"view-" + (view.id || "home")}>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="wordmark" href={hrefOf("")} aria-label="RegLab, home"><span className="wordmark-mark" aria-hidden="true" />RegLab</a>
          <nav className="topnav" aria-label="Pages">
            {VIEWS.map((v) => (
              <a key={v.id} href={hrefOf(v.id)} aria-current={v.id === view.id ? "page" : undefined}>{v.nav}</a>
            ))}
          </nav>
          <button type="button" className="tool theme-toggle" onClick={cycleTheme} aria-label={`${THEME_LABEL[theme]}. Change theme`} title={THEME_LABEL[theme]}>
            <Icon name={theme === "auto" ? "auto" : theme === "light" ? "sun" : "moon"} />
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {!view.ownHeading && <h1 className="sr-only">{view.title}</h1>}
        <Component key={view.id} />
      </main>
    </div>
  );
}
