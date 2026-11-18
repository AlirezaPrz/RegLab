/** Runs a converter on what was typed. While the input has an error, the last result that worked stays on screen, marked stale. */
import { useDeferredValue, useMemo, useState } from "react";
import { toInputError, type InputError } from "../../engine/index.ts";

export interface Conversion<T> {
  /** the result for the current input, or the last one that worked while there is an error */
  result: T | null;
  /** the text `result` was converted from */
  input: string;
  /** null while the input is empty: it is still being written */
  error: InputError | null;
  /** the text `error` points into (typing runs slightly ahead of converting) */
  errorInput: string;
  /** result belongs to an earlier input */
  stale: boolean;
}

/** `convert` must be a stable function (the engine's convertRegex or convertAutomaton). */
export function useConversion<T>(convert: (alphabet: string, text: string) => T, alphabet: string, text: string): Conversion<T> {
  // converting can take a moment on large inputs, so typing never waits for it
  const a = useDeferredValue(alphabet), t = useDeferredValue(text);
  const now = useMemo(() => {
    if (!t.trim()) return { result: null, error: null };
    try { return { result: convert(a, t), error: null }; }
    catch (e) { return { result: null, error: toInputError(e, "input") }; }
  }, [convert, a, t]);
  // remember the last good result (updating state during render is React's pattern for this)
  const [kept, setKept] = useState<{ result: T; input: string } | null>(now.result ? { result: now.result, input: t } : null);
  if (now.result && now.result !== kept?.result) setKept({ result: now.result, input: t });

  if (!t.trim()) return { result: null, input: "", error: null, errorInput: t, stale: false };
  if (now.result) return { result: now.result, input: t, error: null, errorInput: t, stale: false };
  return { result: kept?.result ?? null, input: kept?.input ?? "", error: now.error, errorInput: t, stale: !!kept };
}
