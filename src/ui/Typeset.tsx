/*
 * Course-notation typesetting for display only: #_ab(w) gets a subscript, >= becomes ≥,
 * w is italic, a star is raised. Purely presentational; parsing stays in the engine.
 */
import { Fragment, type ReactNode } from "react";

const OPS: Record<string, string> = { ">=": "≥", "<=": "≤", "!=": "≠", "==": "=", "=": "=", ">": ">", "<": "<", "≥": "≥", "≤": "≤", "≠": "≠" };

/** A language description, e.g. "#_ab(w) = 1 and ends in aa". */
export function TypesetSpec({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /#_?\{?([^\s(){}=<>!≥≤≠]+)\}?(\(w\))?|>=|<=|!=|==|[=<>≥≤≠]|\|w\||\bw\b|\b(and|or|xor|not|mod)\b/g;
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

/** The whole definition of a described language: L = { w ∈ {a, b}* : … }. */
export function Definition({ alphabet, text }: { alphabet: string[]; text: string }) {
  return (
    <span className="math">
      <i>L</i> <span className="m-op">=</span> {"{ "}<i>w</i> <span className="m-op">∈</span> {"{"}{alphabet.join(", ")}{"}"}<sup>∗</sup>
      {" : "}<TypesetSpec text={text.trim()} />{" }"}
    </span>
  );
}
