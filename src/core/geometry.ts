import type { Rect, Vec2 } from './types'
import { normalizeAngle } from './movement'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** World angle (radians) of the vector from `from` to `to`. */
export function angleBetween(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x)
}

/** Angle of `worldAngle` relative to `reference`, normalized to (-PI, PI]. */
export function relativeAngle(reference: number, worldAngle: number): number {
  return normalizeAngle(worldAngle - reference)
}

/** Rotate `current` toward `target` by at most `maxDelta`, taking the short way around. */
export function stepAngleToward(current: number, target: number, maxDelta: number): number {
  const diff = normalizeAngle(target - current)
  if (Math.abs(diff) <= maxDelta) return normalizeAngle(target)
  return normalizeAngle(current + Math.sign(diff) * maxDelta)
}

/** Nearest point on (or inside) `rect` to `p`. */
export function clampPointToRect(p: Vec2, rect: Rect): Vec2 {
  return {
    x: clamp(p.x, rect.x, rect.x + rect.width),
    y: clamp(p.y, rect.y, rect.y + rect.height),
  }
}

export function circleIntersectsRect(center: Vec2, radius: number, rect: Rect): boolean {
  const nearest = clampPointToRect(center, rect)
  return distance(center, nearest) < radius
}

/**
 * Liang-Barsky clip of segment a→b against `rect`.
 * Returns the entry parameter t in [0, 1] (0 if `a` starts inside), or null if no intersection.
 */
export function segmentRectEntry(a: Vec2, b: Vec2, rect: Rect): number | null {
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  const p = [-dx, dx, -dy, dy]
  const q = [a.x - rect.x, rect.x + rect.width - a.x, a.y - rect.y, rect.y + rect.height - a.y]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null
      continue
    }
    const r = q[i] / p[i]
    if (p[i] < 0) {
      if (r > t1) return null
      if (r > t0) t0 = r
    } else {
      if (r < t0) return null
      if (r < t1) t1 = r
    }
  }
  return t0
}

export function segmentIntersectsRect(a: Vec2, b: Vec2, rect: Rect): boolean {
  return segmentRectEntry(a, b, rect) !== null
}

/**
 * First intersection of segment a→b with a circle, as a parameter t in [0, 1]
 * (0 if `a` starts inside), or null if the segment misses the circle.
 */
export function segmentCircleHit(a: Vec2, b: Vec2, center: Vec2, radius: number): number | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const fx = a.x - center.x
  const fy = a.y - center.y
  const A = dx * dx + dy * dy
  const C = fx * fx + fy * fy - radius * radius
  if (C <= 0) return 0
  if (A === 0) return null
  const B = 2 * (fx * dx + fy * dy)
  const disc = B * B - 4 * A * C
  if (disc < 0) return null
  const sqrtDisc = Math.sqrt(disc)
  const t = (-B - sqrtDisc) / (2 * A)
  if (t >= 0 && t <= 1) return t
  return null
}

/** Distance from `origin` along `heading` to the boundary of a [0,w]x[0,h] box. */
export function rayBoundsDistance(
  origin: Vec2,
  heading: number,
  width: number,
  height: number,
): number {
  const dx = Math.cos(heading)
  const dy = Math.sin(heading)
  let best = Infinity
  if (dx > 0) best = Math.min(best, (width - origin.x) / dx)
  if (dx < 0) best = Math.min(best, -origin.x / dx)
  if (dy > 0) best = Math.min(best, (height - origin.y) / dy)
  if (dy < 0) best = Math.min(best, -origin.y / dy)
  return best
}
