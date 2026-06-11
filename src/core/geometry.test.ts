import { describe, expect, it } from 'vitest'
import {
  angleBetween,
  circleIntersectsRect,
  clamp,
  clampPointToRect,
  distance,
  rayBoundsDistance,
  relativeAngle,
  segmentCircleHit,
  segmentIntersectsRect,
  segmentRectEntry,
  stepAngleToward,
} from './geometry'

const rect = { x: 100, y: 100, width: 50, height: 40 }

describe('clamp', () => {
  it('bounds values to the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})

describe('distance and angleBetween', () => {
  it('computes euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('computes world angle toward a point', () => {
    expect(angleBetween({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0)
    expect(angleBetween({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2)
  })
})

describe('relativeAngle', () => {
  it('normalizes the difference to (-PI, PI]', () => {
    expect(relativeAngle(0, Math.PI / 4)).toBeCloseTo(Math.PI / 4)
    expect(relativeAngle(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2)
  })
})

describe('stepAngleToward', () => {
  it('snaps to target when within maxDelta', () => {
    expect(stepAngleToward(0, 0.05, 0.1)).toBeCloseTo(0.05)
  })

  it('moves by maxDelta toward the target', () => {
    expect(stepAngleToward(0, 1, 0.1)).toBeCloseTo(0.1)
  })

  it('takes the short way across the PI boundary', () => {
    const result = stepAngleToward(Math.PI * 0.95, -Math.PI * 0.95, 0.05)
    expect(result).toBeCloseTo(Math.PI * 0.95 + 0.05)
  })
})

describe('clampPointToRect / circleIntersectsRect', () => {
  it('returns the nearest point on the rect', () => {
    expect(clampPointToRect({ x: 0, y: 0 }, rect)).toEqual({ x: 100, y: 100 })
    expect(clampPointToRect({ x: 120, y: 110 }, rect)).toEqual({ x: 120, y: 110 })
  })

  it('detects circle overlap', () => {
    expect(circleIntersectsRect({ x: 90, y: 120 }, 15, rect)).toBe(true)
    expect(circleIntersectsRect({ x: 90, y: 120 }, 5, rect)).toBe(false)
  })
})

describe('segmentRectEntry', () => {
  it('returns entry parameter for a crossing segment', () => {
    const t = segmentRectEntry({ x: 0, y: 120 }, { x: 200, y: 120 }, rect)
    expect(t).toBeCloseTo(0.5)
  })

  it('returns 0 when the segment starts inside', () => {
    expect(segmentRectEntry({ x: 120, y: 120 }, { x: 300, y: 120 }, rect)).toBe(0)
  })

  it('returns null for a miss', () => {
    expect(segmentRectEntry({ x: 0, y: 0 }, { x: 200, y: 0 }, rect)).toBeNull()
    expect(segmentIntersectsRect({ x: 0, y: 0 }, { x: 200, y: 0 }, rect)).toBe(false)
  })
})

describe('segmentCircleHit', () => {
  it('finds the first intersection parameter', () => {
    const t = segmentCircleHit({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, 10)
    expect(t).toBeCloseTo(0.4)
  })

  it('returns 0 when starting inside the circle', () => {
    expect(segmentCircleHit({ x: 50, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, 10)).toBe(0)
  })

  it('returns null when missing', () => {
    expect(segmentCircleHit({ x: 0, y: 20 }, { x: 100, y: 20 }, { x: 50, y: 0 }, 10)).toBeNull()
  })

  it('returns null when the hit is beyond the segment end', () => {
    expect(segmentCircleHit({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 50, y: 0 }, 10)).toBeNull()
  })
})

describe('rayBoundsDistance', () => {
  it('measures distance to each wall', () => {
    expect(rayBoundsDistance({ x: 100, y: 100 }, 0, 1200, 1000)).toBeCloseTo(1100)
    expect(rayBoundsDistance({ x: 100, y: 100 }, Math.PI, 1200, 1000)).toBeCloseTo(100)
    expect(rayBoundsDistance({ x: 100, y: 100 }, Math.PI / 2, 1200, 1000)).toBeCloseTo(900)
  })
})
