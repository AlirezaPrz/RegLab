/** For a smallest DFA: which states of the DFA it was made from each of its states merges. */
export function MergeTable({ names, merged, caption }: { names: string[]; merged: string[][]; caption: string }) {
  return (
    <table className="ttable side-table">
      <caption>{caption}</caption>
      <thead><tr><th scope="col">State</th><th scope="col">Merges</th></tr></thead>
      <tbody>
        {names.map((name, i) => (
          <tr key={name}>
            <th scope="row" className="mono">{name}</th>
            {/* bold where states really were merged, not just renamed */}
            <td className="mono">{merged[i].length > 1 ? <b>{merged[i].join(", ")}</b> : merged[i].join(", ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
