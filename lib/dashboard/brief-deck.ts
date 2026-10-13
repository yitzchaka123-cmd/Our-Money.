/**
 * The daily brief deck's steps: 0 is the intro, 1..N the item cards, N + 1
 * the end card "סיימנו להיום".
 */

/**
 * Where the deck opens. With nothing new — say, from the drawer's link when
 * the count is 0 — it opens straight at the end card instead of doing nothing.
 */
export function openingStep(itemCount: number): number {
  return itemCount > 0 ? 0 : itemCount + 1;
}

/**
 * "נשארו עוד N" under an item card: the item cards after this one, as RiseUp
 * counts them — the first of three says "נשארו עוד 2", the last says nothing.
 */
export function cardsLeftAfter(step: number, itemCount: number): number {
  return Math.max(itemCount - step, 0);
}
