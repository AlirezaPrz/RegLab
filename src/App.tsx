/** The app shell: header, hash router and theme. */
import { useEffect, useState, type ComponentType } from "react";
import { CheckView } from "./features/check/CheckView.tsx";
import { ConvertView } from "./features/convert/ConvertView.tsx";
import { HomeView } from "./features/home/HomeView.tsx";
import { Icon } from "./ui/Icon.tsx";

/** Pages in header order; the first is the landing page. Tools are named for the topic they cover. */
const VIEWS: { id: string; nav: string; title: string; Component: ComponentType; ownHeading?: boolean; aliases?: string[] }[] = [
  { id: "", nav: "About", title: "A workbench for the theory of computation", Component: HomeView, ownHeading: true },
  { id: "regular", nav: "Regular Languages", title: "Regular Languages: check an answer", Component: CheckView, aliases: ["check"] },
  { id: "convert", nav: "Regex ⇄ Automata", title: "Regex ⇄ Automata: convert between regular expressions and automata", Component: ConvertView },
];

const hrefOf = (id: string) => (id ? `#/${id}` : "#/");

/** Sets arrows in the math font. One wrapping span keeps the flex link from trimming the spaces around them. */
const navLabel = (text: string) =>
  <span>{text.split(/([⇄→])/).map((part, i) => (i % 2 ? <span key={i} className="math">{part}</span> : part))}</span>;

type Theme = "auto" | "light" | "dark";
const NEXT: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };
const THEME_LABEL: Record<Theme, string> = { auto: "Theme: match system", light: "Theme: light", dark: "Theme: dark" };

/** The theme, as data-theme on <html>, remembered in localStorage (index.html applies it before first paint). */
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

/** The page from the URL hash; hash routing keeps the site static for GitHub Pages. */
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

export function App() {
  const [theme, cycleTheme] = useTheme();
  const view = useHashView();
  const { Component } = view;
  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="wordmark" href={hrefOf("")} aria-label="RegLab, home"><span className="wordmark-mark" aria-hidden="true" />RegLab</a>
          <nav className="topnav" aria-label="Pages">
            {VIEWS.map((v) => (
              <a key={v.id} href={hrefOf(v.id)} aria-current={v.id === view.id ? "page" : undefined}>{navLabel(v.nav)}</a>
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
    </>
  );
}
