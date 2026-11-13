/** On-screen keys for symbols that are hard to type (ε, ∅, +, *, parentheses). */
import type { RefObject } from "react";

const NAMES: Record<string, string> = {
  "ε": "empty string ε",
  "∅": "empty set ∅",
  "+": "union +",
  "*": "star *",
  "(": "opening parenthesis",
  ")": "closing parenthesis",
  ",": "comma",
};

export const REGEX_KEYS = ["ε", "∅", "+", "*", "(", ")"];

/**
 * On-screen keys that type into an input at the caret. They don't take focus away from
 * the input, so a phone keyboard stays open.
 */
export function SymbolKeys({ target, value, onChange, keys = REGEX_KEYS, label }: {
  target: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  keys?: string[];
  label: string;
}) {
  const insert = (sym: string) => {
    const el = target.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    onChange(value.slice(0, start) + sym + value.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + sym.length, start + sym.length);
    });
  };
  return (
    <div className="keys" role="group" aria-label={label}>
      {keys.map((k) => (
        <button
          key={k} type="button" className="key"
          aria-label={`Type ${NAMES[k] ?? k}`}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => insert(k)}
        >{k}</button>
      ))}
    </div>
  );
}
