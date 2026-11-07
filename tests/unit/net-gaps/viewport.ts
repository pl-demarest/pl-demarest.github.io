import type { Window as HappyWindow } from 'happy-dom';

/** Resize the happy-dom window; happy-dom dispatches 'resize' on window. */
export function setViewport(width: number, height: number): void {
  (window as unknown as HappyWindow).happyDOM.setViewport({ width, height });
}
