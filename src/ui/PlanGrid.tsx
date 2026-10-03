import { formatMonth } from '../lib/dates';

// Plans month by month, one row per category: a solid square for a month
// that stayed within its plan, a hatched one for a month over it, and an
// empty one for a month without a plan. The count says how many held. One
// blue mark sits under the latest month, the only "now" here. It is a table,
// so a screen reader reads each month's result by row and column.

export type PlanCell = { month: string; state: 'within' | 'over' | 'none' };
export type PlanRow = { key: string; label: string; cells: PlanCell[] };

const WORDS = { within: 'Within plan', over: 'Over plan', none: 'No plan' } as const;

export function PlanGrid({ rows, months, caption }: { rows: PlanRow[]; months: string[]; caption: string }) {
  return (
    <div className="table-wrap">
      <table className="plan-grid">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Category</span>
            </th>
            {months.map((m) => (
              <th key={m} scope="col" className="plan-month">
                <abbr title={formatMonth(m)}>{formatMonth(m).slice(0, 1)}</abbr>
              </th>
            ))}
            <th scope="col" className="num">
              <span className="visually-hidden">Months within plan</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const planned = row.cells.filter((c) => c.state !== 'none').length;
            const within = row.cells.filter((c) => c.state === 'within').length;
            return (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                {row.cells.map((cell) => (
                  <td key={cell.month}>
                    <span className={`plan-cell plan-${cell.state}`} aria-hidden="true" />
                    <span className="visually-hidden">{WORDS[cell.state]}</span>
                  </td>
                ))}
                <td className="num secondary">
                  {within}/{planned}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot aria-hidden="true">
          <tr>
            <td />
            {months.map((m, i) => (
              <td key={m}>{i === months.length - 1 && <span className="plan-now" />}</td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
