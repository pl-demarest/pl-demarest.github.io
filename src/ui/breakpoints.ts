/**
 * The widest viewport, in CSS px, that gets the mobile layout: the bottom
 * panel bar, the mobile camera and the mobile hover zones. style.css uses
 * the same value in `@media (max-width: 767px)`; a unit test keeps the two
 * equal.
 */
export const MOBILE_MAX_WIDTH = 767;

export function isMobileWidth(width: number): boolean {
  return width <= MOBILE_MAX_WIDTH;
}
