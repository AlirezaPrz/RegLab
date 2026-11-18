/** Runs a converter on what was typed, keeping the last good result (marked stale) while the input has an error. */
import { useDeferredValue, useMemo, useState } from "react";
import { toInputError, type InputError } from "../../engine/index.ts";

export interface Conversion<T> {
  result: T | null;
  /** the text `result` came from */
  input: string;
  /** null while the input is empty */
  error: InputError | null;
  /** the text `error` points into, which can lag what is on screen */
  errorInput: string;
  /** `result` belongs to an earlier input */
  stale: boolean;
}

/** `convert` must be stable (convertRegex or convertAutomaton). */
export function useConversion<T>(convert: (alphabet: string, text: string) => T, alphabet: string, text: string): Conversion<T> {
  // large inputs take a moment, so typing never waits
  const a = useDeferredValue(alphabet), t = useDeferredValue(text);
  const now = useMemo(() => {
    if (!t.trim()) return { result: null, error: null };
    try { return { result: convert(a, t), error: null }; }
    catch (e) { return { result: null, error: toInputError(e, "input") }; }
  }, [convert, a, t]);
  // keep the last good result (setState during render is React's pattern for derived state)
  const [kept, setKept] = useState<{ result: T; input: string } | null>(now.result ? { result: now.result, input: t } : null);
  if (now.result && now.result !== kept?.result) setKept({ result: now.result, input: t });

  if (!t.trim()) return { result: null, input: "", error: null, errorInput: t, stale: false };
  if (now.result) return { result: now.result, input: t, error: null, errorInput: t, stale: false };
  return { result: kept?.result ?? null, input: kept?.input ?? "", error: now.error, errorInput: t, stale: !!kept };
}
