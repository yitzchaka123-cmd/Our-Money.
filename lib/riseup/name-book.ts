import { db } from '@/lib/db/client';
import { buildNameBook, emptyNameBook, type NameBook, type NameBookInput } from '@/lib/riseup/tracker-names';
import type { RiseupBudget } from '@/lib/types';

/** A fresh budget's actuals, in the stored row shape the name book reads. */
export function budgetActualRows(budgets: RiseupBudget[]): NameBookInput['actuals'] {
  return budgets.flatMap((budget) =>
    (budget.envelopes ?? []).flatMap((envelope) =>
      (envelope.actuals ?? []).map((actual) => ({
        envelope_id: envelope.id,
        category_label: actual.categoryLabel ?? actual.expense ?? null,
        business_name: actual.businessName ?? null,
        transaction_date: actual.transactionDate?.slice(0, 10) ?? null,
      })),
    ),
  );
}

/**
 * Every month's tracker names and fixed-charge labels, from what is stored
 * (plus, during a sync, what was just fetched). A failure only costs names,
 * never the dashboard or the sync.
 */
export async function loadNameBook(fresh: NameBookInput['actuals'] = []): Promise<NameBook> {
  try {
    const supabase = db();
    const [envelopes, actuals] = await Promise.all([
      supabase.from('riseup_envelopes').select('envelope_id, envelope_type, name').eq('envelope_type', 'trackingCategory'),
      supabase
        .from('riseup_envelope_actuals')
        .select('envelope_id, category_label, business_name, transaction_date')
        .or('envelope_id.like.*#trackingCategory#*,envelope_id.like.*#fixed#*'),
    ]);
    const failed = envelopes.error ?? actuals.error;
    if (failed) {
      console.warn('Could not load envelope names:', failed.message);
      return fresh.length > 0 ? buildNameBook({ envelopes: [], actuals: fresh }) : emptyNameBook();
    }
    return buildNameBook({
      envelopes: (envelopes.data ?? []) as NameBookInput['envelopes'],
      actuals: [...((actuals.data ?? []) as NameBookInput['actuals']), ...fresh],
    });
  } catch (error) {
    console.warn('Could not load envelope names:', error instanceof Error ? error.message : String(error));
    return emptyNameBook();
  }
}
