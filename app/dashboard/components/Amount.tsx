import { splitAmount } from '@/lib/money';

/**
 * RiseUp renders money as three runs at three sizes — a large integer, a small
 * decimal, a medium currency — with the currency sitting to the *left* of the
 * digits, i.e. after them in RTL order.
 *
 * Only the numeric run is forced LTR; forcing the whole thing would move the
 * currency to the wrong side. Sizing is relative to the element's own
 * font-size, so a hero and a table cell share this component.
 */
export function Amount({
  value,
  decimals = 1,
  currency = true,
  className,
}: {
  value: number;
  decimals?: 0 | 1;
  /** Off for the few places RiseUp prints a bare number, like the hero footer. */
  currency?: boolean;
  className?: string;
}) {
  const parts = splitAmount(value, decimals);

  return (
    <span className={className ? `amount ${className}` : 'amount'}>
      <bdi className="num">
        <span className="int">
          {parts.sign}
          {parts.integer}
        </span>
        {parts.decimal ? <span className="dec">{parts.decimal}</span> : null}
      </bdi>
      {currency ? <span className="cur">{parts.currency}</span> : null}
    </span>
  );
}
