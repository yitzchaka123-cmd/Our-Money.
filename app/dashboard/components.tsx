import { formatIls } from '@/lib/money';

export interface Series {
  key: 'bank' | 'cash' | 'unlogged';
  label: string;
  color: string;
  value: number;
}

export const SERIES_COLOR = {
  bank: 'var(--series-bank)',
  cash: 'var(--series-cash)',
  unlogged: 'var(--series-unlogged)',
} as const;

/**
 * Identity never rests on colour alone: the legend is always present for two or
 * more series, and the table view below each chart carries every value.
 */
export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="legend">
      {series.map((item) => (
        <li key={item.key}>
          <span className="swatch" style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Inline labels are only safe on a wide enough segment; narrow ones defer to the legend. */
const INLINE_LABEL_MIN_SHARE = 0.18;

export function CompositionBar({ series, total }: { series: Series[]; total: number }) {
  const visible = series.filter((item) => item.value > 0);
  if (total <= 0 || visible.length === 0) return null;

  return (
    <div className="composition" role="img" aria-label="התפלגות ההוצאות החודש">
      {visible.map((item) => {
        const share = item.value / total;
        return (
          <div
            key={item.key}
            className="segment"
            style={{ ['--seg' as string]: item.color, flexGrow: share }}
            tabIndex={0}
          >
            {share >= INLINE_LABEL_MIN_SHARE ? (
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#ffffff',
                }}
              >
                {Math.round(share * 100)}%
              </span>
            ) : null}
            <span className="tip">
              {item.label}: {formatIls(item.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function CategoryRow({
  label,
  bank,
  cash,
  total,
  max,
  flagged,
}: {
  label: string;
  bank: number;
  cash: number;
  total: number;
  max: number;
  flagged?: boolean;
}) {
  // Each row is a bar scaled against the largest category, so the rows are
  // comparable to each other rather than each filling its own track.
  const scale = max > 0 ? total / max : 0;
  const bankShare = total > 0 ? bank / total : 0;

  return (
    <div>
      <div className="row-head">
        <div className="row-label">
          {flagged ? <span aria-hidden="true">⚠️</span> : null}
          <span>{label}</span>
        </div>
        <div className="row-value">{formatIls(total)}</div>
      </div>
      <div className="track">
        <div className="track-fill" style={{ width: `${Math.max(scale * 100, 2)}%` }}>
          {bank > 0 ? (
            <div
              className="segment"
              style={{ ['--seg' as string]: SERIES_COLOR.bank, flexGrow: bankShare }}
              tabIndex={0}
            >
              <span className="tip">כרטיס ובנק: {formatIls(bank)}</span>
            </div>
          ) : null}
          {cash > 0 ? (
            <div
              className="segment"
              style={{
                ['--seg' as string]: flagged ? SERIES_COLOR.unlogged : SERIES_COLOR.cash,
                flexGrow: 1 - bankShare,
              }}
              tabIndex={0}
            >
              <span className="tip">
                {flagged ? 'טרם נרשם' : 'מזומן'}: {formatIls(cash)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      {bank > 0 && cash > 0 ? (
        <div className="row-split">
          <span>כרטיס {formatIls(bank)}</span>
          <span>מזומן {formatIls(cash)}</span>
        </div>
      ) : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  note,
  state,
  wide,
}: {
  label: string;
  value: string;
  note?: string;
  state?: 'good' | 'warning';
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'tile tile--wide' : 'tile'}>
      <p className="label">{label}</p>
      <p className="value">{value}</p>
      {note ? (
        <p className="delta" data-state={state}>
          {/* Status never travels as colour alone — the icon and the words carry it. */}
          {state === 'good' ? <span aria-hidden="true">✓</span> : null}
          {state === 'warning' ? <span aria-hidden="true">⚠️</span> : null}
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function TableView({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: string[][];
}) {
  return (
    <details className="table-view">
      <summary>{caption}</summary>
      <table>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join('|')}>
              {row.map((cell, index) => (
                <td key={index}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
