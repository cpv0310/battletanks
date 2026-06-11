import { describe, expect, it } from 'vitest'
import { MATCH_TIME_LIMIT_TICKS, TANK_HP, TANK_RADIUS } from '../config'
import { createMatch, evaluateMatch } from './match'
import { circleIntersectsRect, distance } from './geometry'
import { makeState, makeTank } from './testHelpers'

function players(...specs: ReadonlyArray<string | [string, number | null]>) {
  return specs.map((spec) =>
    typeof spec === 'string' ? { name: spec, team: null } : { name: spec[0], team: spec[1] },
  )
}

describe('createMatch', () => {
  it('rejects invalid player counts', () => {
    expect(() => createMatch(players('solo'), 1, 'open')).toThrow()
    expect(() => createMatch(players(...Array(9).fill('p')), 1, 'open')).toThrow()
  })

  it('creates a tank per player at full hp on distinct spawns', () => {
    const state = createMatch(players('a', 'b', 'c', 'd'), 7, 'pillars')
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

  it('assigns teams to tanks', () => {
    const state = createMatch(players(['a', 1], ['b', 1], 'c'), 3, 'open')
    expect(state.tanks.map((tank) => tank.team)).toEqual([1, 1, null])
  })

  it('is deterministic for the same seed', () => {
    const a = createMatch(players('a', 'b', 'c'), 42, 'scatter')
    const b = createMatch(players('a', 'b', 'c'), 42, 'scatter')
    expect(a).toEqual(b)
  })

  it('differs across seeds', () => {
    const a = createMatch(players('a', 'b'), 1, 'open')
    const b = createMatch(players('a', 'b'), 2, 'open')
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

describe('evaluateMatch with teams', () => {
  it('keeps running while two teammates and an enemy live', () => {
    const state = makeState([
      makeTank({ id: 0, team: 1 }),
      makeTank({ id: 1, x: 200, y: 200, team: 1 }),
      makeTank({ id: 2, x: 900, y: 200 }),
    ])
    expect(evaluateMatch(state)).toBeNull()
  })

  it('declares the surviving team the winner together', () => {
    const state = makeState([
      makeTank({ id: 0, team: 1 }),
      makeTank({ id: 1, x: 200, y: 200, team: 1 }),
      makeTank({ id: 2, x: 900, y: 200, alive: false, hp: 0 }),
    ])
    expect(evaluateMatch(state)).toEqual({ winners: [0, 1], reason: 'last-standing' })
  })

  it('a team with one survivor still wins as a team', () => {
    const state = makeState([
      makeTank({ id: 0, team: 1, alive: false, hp: 0 }),
      makeTank({ id: 1, x: 200, y: 200, team: 1 }),
      makeTank({ id: 2, x: 900, y: 200, team: 2, alive: false, hp: 0 }),
      makeTank({ id: 3, x: 900, y: 800, team: 2, alive: false, hp: 0 }),
    ])
    expect(evaluateMatch(state)).toEqual({ winners: [1], reason: 'last-standing' })
  })

  it('on timeout the team with the highest total hp wins', () => {
    const state = makeState(
      [
        makeTank({ id: 0, team: 1, hp: 40 }),
        makeTank({ id: 1, x: 200, y: 200, team: 1, hp: 40 }),
        makeTank({ id: 2, x: 900, y: 200, hp: 70 }),
      ],
      { tick: MATCH_TIME_LIMIT_TICKS },
    )
    expect(evaluateMatch(state)).toEqual({ winners: [0, 1], reason: 'timeout' })
  })

  it('solo tanks count as their own team on timeout', () => {
    const state = makeState(
      [
        makeTank({ id: 0, team: 1, hp: 30 }),
        makeTank({ id: 1, x: 200, y: 200, team: 1, hp: 30 }),
        makeTank({ id: 2, x: 900, y: 200, hp: 80 }),
      ],
      { tick: MATCH_TIME_LIMIT_TICKS },
    )
    expect(evaluateMatch(state)).toEqual({ winners: [2], reason: 'timeout' })
  })
})
