/**
 * Optional feature toggles.
 *
 * Every feature listed here is checked BEFORE any markup or script is
 * emitted, so switching a feature off never leaves a dead button, an empty
 * section or a JavaScript error behind.
 *
 *   npm run build   (rebuild required after changing toggles — see README)
 */

export const features = {
  /** Heart-to-save favourites (stored in localStorage, no account needed). */
  wishlist: true,

  /** Side-by-side comparison of up to `compareLimit` diamonds. */
  compare: true,

  /** Native share + copy-link controls on product detail pages. */
  share: true,

  /** Floating WhatsApp button and product-specific enquiry deep links. */
  whatsapp: true,

  /**
   * Price display. Kept OFF: the current inventory has no price field.
   * Turn on only after real prices exist in the inventory and the owner
   * approves public display. Never render placeholder prices.
   */
  price: false,

  /**
   * Cut filter. Kept OFF: 143 of 145 source records have a missing or
   * unusable Cut value (see reports/inventory-audit.md).
   */
  cutFilter: false,

  /** Diamond search box (by Stone ID) on the catalogue. */
  search: true,

  /** Depth / Table range filters (records without a value never match). */
  dimensionsFilters: true,

  /** Homepage + dedicated page for diamond education content. */
  education: true,

  /** Report-presence filter ("report recorded: yes/no"). Never the number itself. */
  reportFilter: true,
} as const;

/** Maximum number of diamonds that can be compared at once. */
export const compareLimit = 4;

export type FeatureName = keyof typeof features;
