/**
 * Frame-rate-independent motion. The scene's damping and easing constants
 * were tuned per frame at 60 Hz. These functions apply such a constant over
 * a step of dt seconds: a 60 Hz step reproduces the per-frame value, and any
 * other step covers the same motion per second.
 */

/** The frame rate the per-frame constants were tuned at. */
export const TUNED_HZ = 60;

/** Exponential damping: `value` scaled by `factorPerFrame` once per tuned frame, over dt seconds. */
export function damp(value: number, factorPerFrame: number, dt: number): number {
  return value * factorPerFrame ** (dt * TUNED_HZ);
}

/**
 * The fraction of the remaining distance an ease covers in dt seconds when
 * it covers `ratePerFrame` of it per tuned frame.
 */
export function lerpFactor(ratePerFrame: number, dt: number): number {
  return 1 - (1 - ratePerFrame) ** (dt * TUNED_HZ);
}

/** Ease `value` toward `target`, covering `ratePerFrame` of the distance per tuned frame. */
export function lerpToward(value: number, target: number, ratePerFrame: number, dt: number): number {
  return value + (target - value) * lerpFactor(ratePerFrame, dt);
}
