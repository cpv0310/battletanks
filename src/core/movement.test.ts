import { describe, expect, it } from 'vitest'
import { normalizeAngle, rotateAngle, velocityFromAngle } from './movement'

describe('velocityFromAngle', () => {
  it('points right at angle 0', () => {
    const v = velocityFromAngle(0, 100)
    expect(v.x).toBeCloseTo(100)
    expect(v.y).toBeCloseTo(0)
  })

  it('points down at PI/2 (screen coordinates)', () => {
    const v = velocityFromAngle(Math.PI / 2, 100)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(100)
  })

  it('reverses direction with negative speed', () => {
    const v = velocityFromAngle(0, -50)
    expect(v.x).toBeCloseTo(-50)
    expect(v.y).toBeCloseTo(0)
  })

  it('returns zero velocity for zero speed', () => {
    const v = velocityFromAngle(1.23, 0)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(0)
  })
})

describe('rotateAngle', () => {
  it('rotates clockwise with direction 1', () => {
    expect(rotateAngle(0, 2, 0.5, 1)).toBeCloseTo(1)
  })

  it('rotates counter-clockwise with direction -1', () => {
    expect(rotateAngle(0, 2, 0.5, -1)).toBeCloseTo(-1)
  })

  it('scales rotation by delta time', () => {
    expect(rotateAngle(0, 3, 1 / 60, 1)).toBeCloseTo(0.05)
  })

  it('wraps past PI into negative range', () => {
    const result = rotateAngle(Math.PI - 0.1, 1, 0.2, 1)
    expect(result).toBeCloseTo(-Math.PI + 0.1)
  })
})

describe('normalizeAngle', () => {
  it('leaves angles within (-PI, PI] unchanged', () => {
    expect(normalizeAngle(1)).toBeCloseTo(1)
    expect(normalizeAngle(-1)).toBeCloseTo(-1)
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI)
  })

  it('wraps angles greater than PI', () => {
    expect(normalizeAngle(Math.PI + 1)).toBeCloseTo(-Math.PI + 1)
  })

  it('wraps angles of multiple turns', () => {
    expect(normalizeAngle(Math.PI * 4 + 0.5)).toBeCloseTo(0.5)
    expect(normalizeAngle(-Math.PI * 4 - 0.5)).toBeCloseTo(-0.5)
  })
})
