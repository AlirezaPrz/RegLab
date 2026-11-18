/** Start and accepting marks for tables, drawn as the diagrams draw them: an arrow in, and a double ring. */
export function StateMark({ kind }: { kind: "start" | "accepting" }) {
  return kind === "start" ? (
    <svg className="state-mark" width="14" height="10" viewBox="0 0 14 10" role="img" aria-label="start">
      <path d="M1 5h7.5" />
      <path className="state-mark-head" d="M13 5L7.5 1.8v6.4z" />
    </svg>
  ) : (
    <svg className="state-mark" width="12" height="12" viewBox="0 0 12 12" role="img" aria-label="accepting">
      <circle cx="6" cy="6" r="5.2" />
      <circle cx="6" cy="6" r="2.7" />
    </svg>
  );
}
