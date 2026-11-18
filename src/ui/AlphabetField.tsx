import { useId, useRef } from "react";
import type { InputError } from "../engine/index.ts";
import { FieldError, selectInInput } from "./FieldError.tsx";

/** The alphabet input, with its error underneath. */
export function AlphabetField({ value, error, onChange }: { value: string; error: InputError | null; onChange: (next: string) => void }) {
  const ids = { input: useId(), err: useId() };
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="row">
        <div className="field field-narrow">
          <label htmlFor={ids.input}>Alphabet Σ</label>
          <input id={ids.input} ref={ref} className="mono" type="text" value={value}
            spellCheck={false} autoComplete="off" autoCapitalize="off"
            aria-invalid={!!error} aria-describedby={error ? ids.err : undefined}
            onChange={(e) => onChange(e.target.value)} />
        </div>
      </div>
      {error && <FieldError id={ids.err} error={error} source={value}
        onLocate={() => selectInInput(ref.current, error.from ?? 0, error.to ?? 0)} />}
    </>
  );
}
