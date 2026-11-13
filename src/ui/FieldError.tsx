/** Errors shown next to the input they belong to, with the problem marked in the typed text. */
import type { InputError } from "../engine/index.ts";
import { Icon } from "./Icon.tsx";

/** Focus a text field and select [from, to). */
export function selectInInput(el: HTMLInputElement | HTMLTextAreaElement | null, from: number, to: number) {
  if (!el) return;
  el.focus();
  el.setSelectionRange(from, Math.max(from, to));
}

/** Character range of a 1-based line in `text`, without its newline. */
export function lineRange(text: string, line: number): [number, number] {
  const lines = text.split("\n");
  const from = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
  return [from, from + (lines[line - 1] ?? "").length];
}

/**
 * An input's error, shown directly under it. When the engine says where the problem is,
 * the typed text is quoted with that part marked, and "Show in input" selects it.
 */
export function FieldError({ id, error, source, onLocate }: {
  id: string;
  error: InputError;
  source: string;
  /** selects the problem in the input; offered when the error has a range or a line */
  onLocate?: () => void;
}) {
  const { from, to } = error;
  let snippet = null;
  if (from !== undefined && to !== undefined && !source.includes("\n")) {
    // a window around the problem, so long inputs stay readable on phones
    const a = Math.max(0, from - 24), b = Math.min(source.length, Math.max(to, from) + 24);
    const mark = source.slice(from, to);
    snippet = (
      <span className="err-snippet" aria-hidden="true">
        {a > 0 && "…"}{source.slice(a, from)}
        <mark className={mark ? undefined : "err-gap"}>{mark || " "}</mark>
        {source.slice(to, b)}{b < source.length && "…"}
      </span>
    );
  }
  return (
    <div id={id} className="field-error" role="alert">
      <Icon name="alert" size={16} />
      <div>
        <p>{error.message}</p>
        {snippet}
        {onLocate && ((from !== undefined && to !== undefined) || error.line !== undefined) && (
          <button type="button" className="linkish" onClick={onLocate}>Show in input</button>
        )}
      </div>
    </div>
  );
}
