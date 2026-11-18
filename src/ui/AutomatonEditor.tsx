/** The text editor for an automaton written one transition per line, used for answers and in the converter. */
import { useId, useRef, useState, type ReactNode } from "react";
import type { InputError } from "../engine/index.ts";
import { FieldError, lineRange, selectInInput } from "./FieldError.tsx";
import { SymbolKeys } from "./SymbolKeys.tsx";

const PLACEHOLDER = "start: q0\naccept: q1\nq0 b q0\nq0 a q1\nq1 b q1\nq1 a q2\nq2 a,b q2";

/**
 * A textarea with line numbers (the gutter mirrors its scroll, so they stay aligned), ε and comma
 * keys, and the error under it with its line marked. `submitHint` ends the help text, for example
 * how to check with the keyboard; onSubmit runs on Ctrl+Enter or ⌘+Enter.
 */
export function AutomatonEditor({ label, value, onChange, error, onSubmit, submitHint }: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  error: InputError | null;
  onSubmit?: () => void;
  submitHint?: ReactNode;
}) {
  const ids = { text: useId(), help: useId(), err: useId() };
  const ref = useRef<HTMLTextAreaElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const lines = Math.max(8, value.split("\n").length);

  return (
    <div className="field">
      <label htmlFor={ids.text}>{label}</label>
      <div className={"editor" + (error ? " has-error" : "")}>
        <div className="editor-gutter" aria-hidden="true">
          <div style={{ transform: `translateY(${-scrollTop}px)` }}>
            {Array.from({ length: lines }, (_, i) => (
              <div key={i} className={error?.line === i + 1 ? "is-error" : undefined}>{i + 1}</div>
            ))}
          </div>
        </div>
        <textarea id={ids.text} ref={ref} className="mono editor-text" rows={8} wrap="off"
          value={value} placeholder={PLACEHOLDER}
          spellCheck={false} autoComplete="off" autoCapitalize="off"
          aria-invalid={!!error} aria-describedby={[ids.help, error ? ids.err : ""].join(" ").trim()}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (onSubmit && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit(); } }} />
      </div>
      <SymbolKeys target={ref} value={value} keys={["ε", ","]} label="Automaton symbols" onChange={onChange} />
      {error && <FieldError id={ids.err} error={error} source={value}
        onLocate={() => {
          const [from, to] = error.line ? lineRange(value, error.line) : [error.from ?? 0, error.to ?? 0];
          selectInInput(ref.current, from, to);
        }} />}
      <p id={ids.help} className="help">
        Write <code>state symbol state</code>, plus a <code>start:</code> line and an <code>accept:</code> line.
        Several symbols can share a line (<code>q2 a,b q2</code>). Use <code>ε</code> or <code>eps</code> for an ε-move, which makes it an NFA.
        {submitHint && <> {submitHint}</>}
      </p>
    </div>
  );
}
