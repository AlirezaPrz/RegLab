import type { ReactNode } from "react";
import type { Samples } from "../engine/index.ts";
import { StringToken } from "./StringToken.tsx";

/** The shortest strings in and not in a language, named `of` (L, L(R), …). With onTry each one is runnable. */
export function SampleStrings({ samples, of, onTry }: { samples: Samples; of: ReactNode; onTry?: (w: string) => void }) {
  const list = (ws: string[], none: string) =>
    ws.length ? ws.map((w) => <StringToken key={w} value={w} onTry={onTry} />) : <span className="muted">{none}</span>;
  return (
    <dl className="samples">
      <dt>In {of}</dt>
      <dd>{list(samples.yes, "no strings at all")}</dd>
      <dt>Not in {of}</dt>
      <dd>{list(samples.no, "none: every string is in the language")}</dd>
    </dl>
  );
}
