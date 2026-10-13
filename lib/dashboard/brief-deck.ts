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
