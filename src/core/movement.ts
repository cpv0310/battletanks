export interface Vec2 {
  readonly x: number
  readonly y: number
}

/**
 * Velocity vector for a body facing `angleRad` moving at `speed`.
 * Negative speed moves the body in reverse.
 */
export function velocityFromAngle(angleRad: number, speed: number): Vec2 {
  return {
    x: Math.cos(angleRad) * speed,
    y: Math.sin(angleRad) * speed,
  }
}

/**
 * Rotate `angleRad` by `rotationSpeed * deltaSeconds` in `direction`
 * (-1 counter-clockwise, 1 clockwise), normalized to (-PI, PI].
 */
export function rotateAngle(
  angleRad: number,
  rotationSpeed: number,
  deltaSeconds: number,
  direction: -1 | 1,
): number {
  return normalizeAngle(angleRad + rotationSpeed * deltaSeconds * direction)
}

/** Normalize an angle in radians to the range (-PI, PI]. */
export function normalizeAngle(angleRad: number): number {
  const twoPi = Math.PI * 2
  let normalized = angleRad % twoPi
  if (normalized > Math.PI) normalized -= twoPi
  if (normalized <= -Math.PI) normalized += twoPi
  return normalized
}
