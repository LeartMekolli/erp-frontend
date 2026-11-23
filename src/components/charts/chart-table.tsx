export type ChartTableProps = {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
};

/**
 * The chart's data as a table for screen readers: the visible chart is `aria-hidden`.
 * `sr-only` sits on a wrapper, not the table: a table ignores `width: 1px` and grows to
 * its content, so a hidden table with long rows widened the page.
 */
export function ChartTable({ caption, columns, rows }: ChartTableProps) {
  return (
    <div className="sr-only">
      <table>
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
    </div>
  );
}
