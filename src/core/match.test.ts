import { describe, expect, it } from 'vitest'
import { MATCH_TIME_LIMIT_TICKS, TANK_HP, TANK_RADIUS } from '../config'
import { createMatch, evaluateMatch } from './match'
import { circleIntersectsRect, distance } from './geometry'
import { makeState, makeTank } from './testHelpers'

describe('createMatch', () => {
  it('rejects invalid player counts', () => {
    expect(() => createMatch(['solo'], 1, 'open')).toThrow()
    expect(() => createMatch(Array(9).fill('p'), 1, 'open')).toThrow()
  })

  it('creates a tank per player at full hp on distinct spawns', () => {
    const names = ['a', 'b', 'c', 'd']
    const state = createMatch(names, 7, 'pillars')
    expect(state.tanks).toHaveLength(4)
    for (const tank of state.tanks) {
      expect(tank.hp).toBe(TANK_HP)
      expect(tank.alive).toBe(true)
      expect(tank.turretHeading).toBe(tank.heading)
      for (const rect of state.arena.obstacles) {
        expect(circleIntersectsRect(tank, TANK_RADIUS, rect)).toBe(false)
      }
    }
    for (let i = 0; i < state.tanks.length; i++) {
      for (let j = i + 1; j < state.tanks.length; j++) {
        expect(distance(state.tanks[i], state.tanks[j])).toBeGreaterThan(100)
      }
    }
  })

  it('is deterministic for the same seed', () => {
    const a = createMatch(['a', 'b', 'c'], 42, 'scatter')
    const b = createMatch(['a', 'b', 'c'], 42, 'scatter')
    expect(a).toEqual(b)
  })

  it('differs across seeds', () => {
    const a = createMatch(['a', 'b'], 1, 'open')
    const b = createMatch(['a', 'b'], 2, 'open')
    expect(a.tanks.map((t) => ({ x: t.x, y: t.y, h: t.heading }))).not.toEqual(
      b.tanks.map((t) => ({ x: t.x, y: t.y, h: t.heading })),
    )
  })
})

describe('evaluateMatch', () => {
  it('returns null while multiple tanks live', () => {
    const state = makeState([makeTank({ id: 0 }), makeTank({ id: 1, x: 200, y: 200 })])
    expect(evaluateMatch(state)).toBeNull()
  })

  it('declares the last tank standing the winner', () => {
    const state = makeState([
      makeTank({ id: 0 }),
      makeTank({ id: 1, x: 200, y: 200, alive: false, hp: 0 }),
    ])
    expect(evaluateMatch(state)).toEqual({ winners: [0], reason: 'last-standing' })
  })

  it('declares a draw when all tanks are destroyed', () => {
    const state = makeState([
      makeTank({ id: 0, alive: false, hp: 0 }),
      makeTank({ id: 1, x: 200, y: 200, alive: false, hp: 0 }),
    ])
    expect(evaluateMatch(state)).toEqual({ winners: [], reason: 'last-standing' })
  })

  it('on timeout the highest-hp tank wins', () => {
    const state = makeState(
      [makeTank({ id: 0, hp: 80 }), makeTank({ id: 1, x: 200, y: 200, hp: 60 })],
      { tick: MATCH_TIME_LIMIT_TICKS },
    )
    expect(evaluateMatch(state)).toEqual({ winners: [0], reason: 'timeout' })
  })

  it('on timeout equal hp is a draw between those tanks', () => {
    const state = makeState(
      [
        makeTank({ id: 0, hp: 60 }),
        makeTank({ id: 1, x: 200, y: 200, hp: 60 }),
        makeTank({ id: 2, x: 900, y: 200, hp: 40 }),
      ],
      { tick: MATCH_TIME_LIMIT_TICKS },
    )
    expect(evaluateMatch(state)).toEqual({ winners: [0, 1], reason: 'timeout' })
  })
})
