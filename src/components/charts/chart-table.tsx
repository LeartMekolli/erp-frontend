export type ChartTableProps = {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
};

/** The chart's data as a table for screen readers: the visible chart is `aria-hidden`. */
export function ChartTable({ caption, columns, rows }: ChartTableProps) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column, i) => (
            <th key={`${i}-${column}`} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td key={c}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
