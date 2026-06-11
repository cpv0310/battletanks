import { describe, expect, it } from 'vitest'
import {
  CANNON_COOLDOWN_TICKS,
  HULL_ROTATION_SPEED,
  SHELL_DAMAGE,
  TANK_FORWARD_SPEED,
  TANK_RADIUS,
  TANK_REVERSE_SPEED,
  TICK_SECONDS,
  TURRET_ROTATION_SPEED,
} from '../config'
import { step } from './step'
import { intentsFor, makeState, makeTank } from './testHelpers'

describe('step: rotation', () => {
  it('turns the hull at the clamped rate', () => {
    const state = makeState([makeTank({ id: 0 })])
    const next = step(state, intentsFor(state.tanks, { 0: { turn: { kind: 'rate', value: 1 } } }))
    expect(next.tanks[0].heading).toBeCloseTo(HULL_ROTATION_SPEED * TICK_SECONDS)
  })

  it('hull rotation carries the turret along', () => {
    const state = makeState([makeTank({ id: 0, turretHeading: 1 })])
    const next = step(state, intentsFor(state.tanks, { 0: { turn: { kind: 'rate', value: 1 } } }))
    expect(next.tanks[0].turretHeading).toBeCloseTo(1 + HULL_ROTATION_SPEED * TICK_SECONDS)
  })

  it('turret turns independently at its own rate', () => {
    const state = makeState([makeTank({ id: 0 })])
    const next = step(
      state,
      intentsFor(state.tanks, { 0: { turretTurn: { kind: 'rate', value: -1 } } }),
    )
    expect(next.tanks[0].heading).toBeCloseTo(0)
    expect(next.tanks[0].turretHeading).toBeCloseTo(-TURRET_ROTATION_SPEED * TICK_SECONDS)
  })

  it('turn-to steers toward the target and stops there', () => {
    const target = 0.01
    const state = makeState([makeTank({ id: 0 })])
    const next = step(state, intentsFor(state.tanks, { 0: { turn: { kind: 'to', target } } }))
    expect(next.tanks[0].heading).toBeCloseTo(target)
    const after = step(next, intentsFor(next.tanks, { 0: { turn: { kind: 'to', target } } }))
    expect(after.tanks[0].heading).toBeCloseTo(target)
  })

  it('clamps turn rates beyond [-1, 1]', () => {
    const state = makeState([makeTank({ id: 0 })])
    const next = step(state, intentsFor(state.tanks, { 0: { turn: { kind: 'rate', value: 5 } } }))
    expect(next.tanks[0].heading).toBeCloseTo(HULL_ROTATION_SPEED * TICK_SECONDS)
  })
})

describe('step: movement', () => {
  it('drives forward along the hull heading', () => {
    const state = makeState([makeTank({ id: 0, x: 100, y: 100 })])
    const next = step(state, intentsFor(state.tanks, { 0: { drive: 1 } }))
    expect(next.tanks[0].x).toBeCloseTo(100 + TANK_FORWARD_SPEED * TICK_SECONDS)
    expect(next.tanks[0].y).toBeCloseTo(100)
    expect(next.tanks[0].speed).toBe(TANK_FORWARD_SPEED)
  })

  it('reverses at the slower reverse speed', () => {
    const state = makeState([makeTank({ id: 0, x: 100, y: 100 })])
    const next = step(state, intentsFor(state.tanks, { 0: { drive: -1 } }))
    expect(next.tanks[0].x).toBeCloseTo(100 - TANK_REVERSE_SPEED * TICK_SECONDS)
  })

  it('is blocked by walls and reports a collision event', () => {
    const state = makeState([makeTank({ id: 0, x: TANK_RADIUS + 1, y: 500, heading: Math.PI })])
    const next = step(state, intentsFor(state.tanks, { 0: { drive: 1 } }))
    expect(next.tanks[0].x).toBeGreaterThanOrEqual(TANK_RADIUS)
    expect(next.events[0].collisions.some((c) => c.kind === 'wall')).toBe(true)
  })

  it('is blocked by obstacles', () => {
    const obstacle = { x: 130, y: 450, width: 100, height: 100 }
    const state = makeState([makeTank({ id: 0, x: 130 - TANK_RADIUS - 1, y: 500 })], {
      obstacles: [obstacle],
    })
    const next = step(state, intentsFor(state.tanks, { 0: { drive: 1 } }))
    expect(next.tanks[0].x).toBeLessThan(130 - TANK_RADIUS + 0.001)
    expect(next.events[0].collisions.some((c) => c.kind === 'obstacle')).toBe(true)
  })

  it('slides along an obstacle when moving diagonally into it', () => {
    const obstacle = { x: 200, y: 0, width: 100, height: 1000 }
    const heading = Math.PI / 4
    const state = makeState([makeTank({ id: 0, x: 200 - TANK_RADIUS - 1, y: 500, heading })], {
      obstacles: [obstacle],
    })
    const next = step(state, intentsFor(state.tanks, { 0: { drive: 1 } }))
    expect(next.tanks[0].y).toBeGreaterThan(500)
  })

  it('sets the blocked flag while pinned against a wall and clears it when free', () => {
    const state = makeState([makeTank({ id: 0, x: TANK_RADIUS + 1, y: 500, heading: Math.PI })])
    const pinned = step(state, intentsFor(state.tanks, { 0: { drive: 1 } }))
    expect(pinned.tanks[0].blocked).toBe(true)

    // Still pushing into the wall next tick: stays blocked.
    const stillPinned = step(pinned, intentsFor(pinned.tanks, { 0: { drive: 1 } }))
    expect(stillPinned.tanks[0].blocked).toBe(true)

    // Reversing away from the wall: no longer blocked.
    const freed = step(stillPinned, intentsFor(stillPinned.tanks, { 0: { drive: -1 } }))
    expect(freed.tanks[0].blocked).toBe(false)
  })

  it('does not set blocked when driving freely or standing still', () => {
    const state = makeState([makeTank({ id: 0, x: 100, y: 100, blocked: true })])
    const moving = step(state, intentsFor(state.tanks, { 0: { drive: 1 } }))
    expect(moving.tanks[0].blocked).toBe(false)
    const idle = step(state, intentsFor(state.tanks))
    expect(idle.tanks[0].blocked).toBe(false)
  })

  it('sets blocked when sliding along an obstacle', () => {
    const obstacle = { x: 200, y: 0, width: 100, height: 1000 }
    const state = makeState(
      [makeTank({ id: 0, x: 200 - TANK_RADIUS - 1, y: 500, heading: Math.PI / 4 })],
      { obstacles: [obstacle] },
    )
    const next = step(state, intentsFor(state.tanks, { 0: { drive: 1 } }))
    expect(next.tanks[0].blocked).toBe(true)
  })

  it('is blocked by another tank', () => {
    const a = makeTank({ id: 0, x: 500, y: 500 })
    const b = makeTank({ id: 1, x: 500 + TANK_RADIUS * 2 + 1, y: 500 })
    const state = makeState([a, b])
    const next = step(state, intentsFor(state.tanks, { 0: { drive: 1 } }))
    expect(next.tanks[0].x).toBeCloseTo(500)
    expect(next.events[0].collisions.some((c) => c.kind === 'tank')).toBe(true)
  })
})

describe('step: firing and shells', () => {
  it('fires a shell and starts the cooldown', () => {
    const state = makeState([makeTank({ id: 0 })])
    const next = step(state, intentsFor(state.tanks, { 0: { fire: true } }))
    expect(next.shells).toHaveLength(1)
    expect(next.shells[0].ownerId).toBe(0)
    expect(next.tanks[0].cooldown).toBe(CANNON_COOLDOWN_TICKS)
  })

  it('cannot fire while on cooldown', () => {
    const state = makeState([makeTank({ id: 0, cooldown: 10 })])
    const next = step(state, intentsFor(state.tanks, { 0: { fire: true } }))
    expect(next.shells).toHaveLength(0)
    expect(next.tanks[0].cooldown).toBe(9)
  })

  it('a shell damages a tank it hits and emits events for both sides', () => {
    const shooter = makeTank({ id: 0, x: 300, y: 500 })
    const target = makeTank({ id: 1, x: 360, y: 500 })
    const state = makeState([shooter, target], {
      shells: [{ id: 0, ownerId: 0, x: 345, y: 500, heading: 0 }],
    })
    const next = step(state, intentsFor(state.tanks))
    expect(next.tanks[1].hp).toBe(100 - SHELL_DAMAGE)
    expect(next.shells).toHaveLength(0)
    expect(next.events[1].hitByShell).toHaveLength(1)
    expect(next.events[0].shellHitEnemy).toEqual([{ targetId: 1 }])
  })

  it('shells never hit their owner', () => {
    const shooter = makeTank({ id: 0, x: 300, y: 500 })
    const other = makeTank({ id: 1, x: 900, y: 500 })
    const state = makeState([shooter, other], {
      shells: [{ id: 0, ownerId: 0, x: 290, y: 500, heading: 0 }],
    })
    const next = step(state, intentsFor(state.tanks))
    expect(next.tanks[0].hp).toBe(100)
  })

  it('obstacles absorb shells', () => {
    const shooter = makeTank({ id: 0, x: 100, y: 500 })
    const target = makeTank({ id: 1, x: 400, y: 500 })
    const state = makeState([shooter, target], {
      obstacles: [{ x: 195, y: 450, width: 50, height: 100 }],
      shells: [{ id: 0, ownerId: 0, x: 190, y: 500, heading: 0 }],
    })
    const next = step(state, intentsFor(state.tanks))
    expect(next.shells).toHaveLength(0)
    expect(next.tanks[1].hp).toBe(100)
  })

  it('shells leaving the arena are removed', () => {
    const state = makeState([makeTank({ id: 0 }), makeTank({ id: 1, x: 100, y: 100 })], {
      shells: [{ id: 0, ownerId: 0, x: 1195, y: 500, heading: 0 }],
    })
    const next = step(state, intentsFor(state.tanks))
    expect(next.shells).toHaveLength(0)
  })

  it('a killing hit marks the tank dead and notifies survivors', () => {
    const shooter = makeTank({ id: 0, x: 300, y: 500 })
    const target = makeTank({ id: 1, x: 360, y: 500, hp: SHELL_DAMAGE })
    const state = makeState([shooter, target], {
      shells: [{ id: 0, ownerId: 0, x: 345, y: 500, heading: 0 }],
    })
    const next = step(state, intentsFor(state.tanks))
    expect(next.tanks[1].alive).toBe(false)
    expect(next.tanks[1].hp).toBe(0)
    expect(next.events[0].enemiesDestroyed).toEqual([{ id: 1 }])
  })

  it('dead tanks do not move, fire, or get hit', () => {
    const dead = makeTank({ id: 0, alive: false, hp: 0 })
    const live = makeTank({ id: 1, x: 900, y: 500 })
    const state = makeState([dead, live], {
      shells: [{ id: 0, ownerId: 1, x: 590, y: 500, heading: Math.PI }],
    })
    const next = step(state, intentsFor(state.tanks, { 0: { drive: 1, fire: true } }))
    expect(next.tanks[0].x).toBe(600)
    expect(next.shells).toHaveLength(1)
    expect(next.tanks[0].hp).toBe(0)
  })
})

describe('step: determinism and immutability', () => {
  it('does not mutate the input state', () => {
    const state = makeState([makeTank({ id: 0 }), makeTank({ id: 1, x: 200, y: 200 })])
    const frozen = JSON.parse(JSON.stringify(state))
    step(state, intentsFor(state.tanks, { 0: { drive: 1, fire: true } }))
    expect(JSON.parse(JSON.stringify(state))).toEqual(frozen)
  })

  it('produces identical results for identical inputs', () => {
    const state = makeState([makeTank({ id: 0 }), makeTank({ id: 1, x: 200, y: 200 })])
    const intents = intentsFor(state.tanks, { 0: { drive: 0.7, turn: { kind: 'rate', value: 0.3 } } })
    expect(step(state, intents)).toEqual(step(state, intents))
  })

  it('increments the tick', () => {
    const state = makeState([makeTank({ id: 0 })])
    expect(step(state, intentsFor(state.tanks)).tick).toBe(1)
  })
})
