/** A segmented control, used for every either/or choice in the tool. */
import { useRef } from "react";

/** A segmented choice built as a radio group: arrow keys move between options. */
export function Segmented<T extends string>({ value, options, onChange, labelledBy }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  labelledBy: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => {
    const n = (i + options.length) % options.length;
    onChange(options[n].value);
    refs.current[n]?.focus();
  };
  return (
    <div className="seg" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value} ref={(el) => { refs.current[i] = el; }}
            type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            className="seg-opt" onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(i + 1); }
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(i - 1); }
            }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}
