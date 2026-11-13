/*
 * Course-notation typesetting for display only: #_ab(w) gets a subscript, >= becomes ≥,
 * w is italic, a star is raised. Purely presentational; parsing stays in the engine.
 */
import { Fragment, type ReactNode } from "react";

const OPS: Record<string, string> = { ">=": "≥", "<=": "≤", "!=": "≠", "==": "=", "=": "=", ">": ">", "<": "<", "≥": "≥", "≤": "≤", "≠": "≠" };

/** A language description, e.g. "#_ab(w) = 1 and ends in aa". */
export function TypesetSpec({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /#_?\{?([^\s(){}=<>!≥≤≠]+)\}?(\(w\))?|>=|<=|!=|==|[=<>≥≤≠]|\|w\||\bw\b|\b(and|or|xor|not|mod|is|divisible|by)\b/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index!;
    if (i > last) out.push(text.slice(last, i));
    const t = m[0];
    if (t.startsWith("#")) out.push(<Fragment key={i}>#<sub>{m[1]}</sub>(<i>w</i>)</Fragment>);
    else if (t in OPS) out.push(<span key={i} className="m-op">{OPS[t]}</span>);
    else if (t === "|w|") out.push(<Fragment key={i}>|<i>w</i>|</Fragment>);
    else if (t === "w") out.push(<i key={i}>w</i>);
    else out.push(<span key={i} className="m-word">{t}</span>);
    last = i + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** A regular expression with raised stars. */
export function TypesetRegex({ text }: { text: string }) {
  const s = text.replace(/\s+/g, "");
  const out: ReactNode[] = [];
  let buf = "";
  [...s].forEach((c, i) => {
    if (c === "*") { out.push(buf, <sup key={i}>∗</sup>); buf = ""; }
    else if (c === "+" || c === "|" || c === "∪") { out.push(buf, <span key={i} className="m-op">+</span>); buf = ""; }
    else buf += c;
  });
  out.push(buf);
  return <>{out}</>;
}

/** The whole definition: L = { w ∈ {a, b}* : … } or L = L(r). */
export function Definition({ alphabet, source, text }: { alphabet: string[]; source: "spec" | "regex"; text: string }) {
  const lhs = <><i>L</i> <span className="m-op">=</span> </>;
  if (source === "regex") {
    return (
      <span className="math">
        {lhs}<i>L</i>(<TypesetRegex text={text} />)
      </span>
    );
  }
  return (
    <span className="math">
      {lhs}{"{ "}<i>w</i> <span className="m-op">∈</span> {"{"}{alphabet.join(", ")}{"}"}<sup>∗</sup>
      <span className="m-colon"> : </span><TypesetSpec text={text.trim()} />{" }"}
    </span>
  );
}
