import { describe, expect, it } from 'vitest'
import { SENSOR_RANGE } from '../config'
import { sense, senseAll } from './sensor'
import { makeState, makeTank } from './testHelpers'

describe('sensor: tank detection', () => {
  it('detects a tank inside the arc, range, and line of sight', () => {
    const sensor = makeTank({ id: 0, x: 300, y: 500, turretHeading: 0 })
    const target = makeTank({ id: 1, x: 500, y: 500 })
    const reading = sense(makeState([sensor, target]), sensor)
    expect(reading.tanks).toHaveLength(1)
    expect(reading.tanks[0].id).toBe(1)
    expect(reading.tanks[0].distance).toBeCloseTo(200)
    expect(reading.tanks[0].bearing).toBeCloseTo(0)
  })

  it('does not detect tanks beyond sensor range', () => {
    const sensor = makeTank({ id: 0, x: 100, y: 500, turretHeading: 0 })
    const target = makeTank({ id: 1, x: 100 + SENSOR_RANGE + 50, y: 500 })
    const reading = sense(makeState([sensor, target]), sensor)
    expect(reading.tanks).toHaveLength(0)
  })

  it('does not detect tanks outside the 90 degree arc', () => {
    const sensor = makeTank({ id: 0, x: 300, y: 500, turretHeading: 0 })
    const justInside = makeTank({ id: 1, x: 400, y: 500 + 95 })
    const outside = makeTank({ id: 2, x: 400, y: 500 + 110 })
    const reading = sense(makeState([sensor, justInside, outside]), sensor)
    expect(reading.tanks.map((t) => t.id)).toEqual([1])
  })

  it('obstacles block line of sight', () => {
    const sensor = makeTank({ id: 0, x: 300, y: 500, turretHeading: 0 })
    const target = makeTank({ id: 1, x: 500, y: 500 })
    const state = makeState([sensor, target], {
      obstacles: [{ x: 390, y: 450, width: 20, height: 100 }],
    })
    expect(sense(state, sensor).tanks).toHaveLength(0)
  })

  it('other tanks do not block line of sight', () => {
    const sensor = makeTank({ id: 0, x: 300, y: 500, turretHeading: 0 })
    const near = makeTank({ id: 1, x: 400, y: 500 })
    const far = makeTank({ id: 2, x: 500, y: 500 })
    const reading = sense(makeState([sensor, near, far]), sensor)
    expect(reading.tanks.map((t) => t.id)).toEqual([1, 2])
  })

  it('ignores dead tanks', () => {
    const sensor = makeTank({ id: 0, x: 300, y: 500, turretHeading: 0 })
    const dead = makeTank({ id: 1, x: 500, y: 500, alive: false, hp: 0 })
    expect(sense(makeState([sensor, dead]), sensor).tanks).toHaveLength(0)
  })

  it('reports bearing relative to the turret, not the hull', () => {
    const sensor = makeTank({ id: 0, x: 300, y: 500, heading: Math.PI, turretHeading: 0 })
    const target = makeTank({ id: 1, x: 500, y: 500 })
    const reading = sense(makeState([sensor, target]), sensor)
    expect(reading.tanks[0].bearing).toBeCloseTo(0)
  })
})

describe('sensor: obstacles and walls', () => {
  it('detects a visible obstacle with distance and bearing', () => {
    const sensor = makeTank({ id: 0, x: 300, y: 500, turretHeading: 0 })
    const rect = { x: 450, y: 480, width: 60, height: 40 }
    const reading = sense(makeState([sensor], { obstacles: [rect] }), sensor)
    expect(reading.obstacles).toHaveLength(1)
    expect(reading.obstacles[0].distance).toBeCloseTo(150)
    expect(reading.obstacles[0].rect).toEqual(rect)
  })

  it('does not report obstacles behind the turret', () => {
    const sensor = makeTank({ id: 0, x: 300, y: 500, turretHeading: 0 })
    const rect = { x: 100, y: 480, width: 60, height: 40 }
    const reading = sense(makeState([sensor], { obstacles: [rect] }), sensor)
    expect(reading.obstacles).toHaveLength(0)
  })

  it('reports the wall along the turret heading when within range', () => {
    const sensor = makeTank({ id: 0, x: 1100, y: 500, turretHeading: 0 })
    const reading = sense(makeState([sensor]), sensor)
    expect(reading.wall).not.toBeNull()
    expect(reading.wall?.distance).toBeCloseTo(100)
  })

  it('reports no wall when it is out of range', () => {
    const sensor = makeTank({ id: 0, x: 600, y: 500, turretHeading: 0 })
    const reading = sense(makeState([sensor]), sensor)
    expect(reading.wall).toBeNull()
  })
})

describe('sensor focus (arc/range tradeoff)', () => {
  it('a narrow arc sees much farther but not wider', () => {
    const sensor = makeTank({ id: 0, x: 300, y: 500, turretHeading: 0, sensorArc: Math.PI / 4 })
    const farAhead = makeTank({ id: 1, x: 300 + 580, y: 500 }) // inside the ~589px beam
    const tooFar = makeTank({ id: 2, x: 300 + 600, y: 500 })
    const toTheSide = makeTank({ id: 3, x: 400, y: 600 }) // ~45 deg off-axis
    const reading = sense(makeState([sensor, farAhead, tooFar, toTheSide]), sensor)
    expect(reading.tanks.map((t) => t.id)).toEqual([1])
  })

  it('a wide arc sees wider but not as far', () => {
    const sensor = makeTank({
      id: 0,
      x: 300,
      y: 500,
      turretHeading: 0,
      sensorArc: Math.PI * 0.75,
    })
    const farAhead = makeTank({ id: 1, x: 300 + 300, y: 500 }) // beyond ~286px wide-range
    const toTheSide = makeTank({ id: 2, x: 400, y: 600 }) // ~45 deg, ~141px away
    const reading = sense(makeState([sensor, farAhead, toTheSide]), sensor)
    expect(reading.tanks.map((t) => t.id)).toEqual([2])
  })

  it('the 30-degree laser focus reaches exactly 750px', () => {
    const sensor = makeTank({ id: 0, x: 100, y: 500, turretHeading: 0, sensorArc: Math.PI / 6 })
    const farAhead = makeTank({ id: 1, x: 100 + 740, y: 500 })
    const tooFar = makeTank({ id: 2, x: 100 + 760, y: 500 })
    const offAxis = makeTank({ id: 3, x: 100 + 200, y: 500 + 80 }) // ~22 deg, outside the 15 deg half-arc
    const reading = sense(makeState([sensor, farAhead, tooFar, offAxis]), sensor)
    expect(reading.tanks.map((t) => t.id)).toEqual([1])
  })

  it('the default arc keeps the original 90-degree, 350px sensor', () => {
    const sensor = makeTank({ id: 0, x: 300, y: 500, turretHeading: 0 })
    const inRange = makeTank({ id: 1, x: 300 + SENSOR_RANGE - 10, y: 500 })
    const reading = sense(makeState([sensor, inRange]), sensor)
    expect(reading.tanks).toHaveLength(1)
  })
})

describe('senseAll', () => {
  it('returns empty readings for dead tanks', () => {
    const dead = makeTank({ id: 0, alive: false, hp: 0 })
    const live = makeTank({ id: 1, x: 200, y: 200 })
    const readings = senseAll(makeState([dead, live]))
    expect(readings[0]).toEqual({ tanks: [], obstacles: [], wall: null })
  })
})
