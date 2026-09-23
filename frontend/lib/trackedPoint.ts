/**
 * Where the locked contact currently sits on screen, in CSS pixels relative to
 * the view's own box. Both scopes write to this every frame and the callout
 * reads it on its own animation frame, so following a moving target never costs
 * a React render.
 */
export interface TrackedPoint {
  x: number;
  y: number;
  visible: boolean;
}

export function emptyPoint(): TrackedPoint {
  return { x: 0, y: 0, visible: false };
}
