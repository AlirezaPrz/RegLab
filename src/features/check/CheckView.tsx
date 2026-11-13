/** The regular-languages tool: the language band, the answer and the verdict, wired to one workbench state. */
import { useEffect, useRef, useState } from "react";
import { useWorkbench } from "../../state/useWorkbench.ts";
import { Definition } from "../../ui/Typeset.tsx";
import { LanguagePanel } from "./LanguagePanel.tsx";

/** The tool page; owns the workbench state and passes it down to the panels. */
export function CheckView() {
  const { state, dispatch, derived } = useWorkbench();
  const bandRef = useRef<HTMLDivElement>(null);
  const [bandHidden, setBandHidden] = useState(false);

  // when the definition band scrolls away, a slim copy of the language stays pinned on top
  useEffect(() => {
    const el = bandRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setBandHidden(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      {derived.language && (
        <div className={"pinned" + (bandHidden ? " is-shown" : "")} aria-hidden={!bandHidden}>
          <span className="pinned-def"><Definition alphabet={derived.language.alphabet} source={state.source} text={state.language} /></span>
        </div>
      )}

      <div ref={bandRef}>
        <LanguagePanel state={state} derived={derived} dispatch={dispatch} onTry={(w) => dispatch({ type: "probe", value: w })} />
      </div>
    </>
  );
}
