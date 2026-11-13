/** How strings over the alphabet are shown, and optionally run, everywhere in the tool. */
import { show } from "../engine/index.ts";

/** A string over the alphabet, ε when empty. With onTry it becomes a button that runs it. */
export function StringToken({ value, onTry }: { value: string; onTry?: (w: string) => void }) {
  const text = show(value);
  if (!onTry) return <span className="tok">{text}</span>;
  return (
    <button type="button" className="tok tok-btn" onClick={() => onTry(value)} aria-label={`Try ${value === "" ? "the empty string" : value}`}>
      {text}
    </button>
  );
}
