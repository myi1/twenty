// ── THE STRIP THE FLOATING PILLS LIVE IN ─────────────────────────────────────
// 2026-09-08. Ayoub screenshotted the Inbox composer with the Quick Note pill sitting on
// top of the Send button. Three launchers share the bottom-right column, and the composer
// left only 16px of right padding, so its right-most control landed underneath them.
//
// These numbers are the DEFAULT geometry of that column. They live here, in one place,
// because the collision happened precisely because the docks knew their offsets and the
// composer did not.

/** Distance from the right edge to the pill column — the docks' default `right`. */
export const DOCK_COLUMN_RIGHT_PX = 14;

/** A collapsed launcher pill is a 44px circle. */
export const DOCK_PILL_SIZE_PX = 44;

/** Visible gap between a UI control and the pill column. */
export const DOCK_COLUMN_GUTTER_PX = 8;

/**
 * How much right-hand space a bottom-anchored control must leave free so the collapsed
 * pills do not cover it.
 *
 * ⚠️ This protects the DEFAULT layout only. All three pills are draggable and remember
 * where they were put, and an EXPANDED dock is a panel far wider than a pill — so a user
 * who parks one on top of a button has chosen that, and can drag it away again. Before
 * 2026-09-08 the Quick Note pill could not be dragged at all, which is what turned an
 * overlap into a trap.
 */
export const DOCK_COLUMN_RESERVED_PX =
  DOCK_COLUMN_RIGHT_PX + DOCK_PILL_SIZE_PX + DOCK_COLUMN_GUTTER_PX;
