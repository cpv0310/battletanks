import { describe, expect, it } from 'vitest'
import {
  cannonCooldownTicks,
  HULL_ROTATION_SPEED,
  shellDamage,
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
    const next = step(state, intentsFor(state.tanks, { 0: { fire: 2 } }))
    expect(next.shells).toHaveLength(1)
    expect(next.shells[0].ownerId).toBe(0)
    expect(next.tanks[0].cooldown).toBe(cannonCooldownTicks(2))
  })

  it('cannot fire while on cooldown', () => {
    const state = makeState([makeTank({ id: 0, cooldown: 10 })])
    const next = step(state, intentsFor(state.tanks, { 0: { fire: 2 } }))
    expect(next.shells).toHaveLength(0)
    expect(next.tanks[0].cooldown).toBe(9)
  })

  it('a shell damages a tank it hits and emits events for both sides', () => {
    const shooter = makeTank({ id: 0, x: 300, y: 500 })
    const target = makeTank({ id: 1, x: 360, y: 500 })
    const state = makeState([shooter, target], {
      shells: [{ id: 0, ownerId: 0, x: 345, y: 500, heading: 0, power: 2 }],
    })
    const next = step(state, intentsFor(state.tanks))
    expect(next.tanks[1].hp).toBe(100 - shellDamage(2))
    expect(next.shells).toHaveLength(0)
    expect(next.events[1].hitByShell).toHaveLength(1)
    expect(next.events[0].shellHitEnemy).toEqual([{ targetId: 1 }])
  })

  it('shells never hit their owner', () => {
    const shooter = makeTank({ id: 0, x: 300, y: 500 })
    const other = makeTank({ id: 1, x: 900, y: 500 })
    const state = makeState([shooter, other], {
      shells: [{ id: 0, ownerId: 0, x: 290, y: 500, heading: 0, power: 2 }],
    })
    const next = step(state, intentsFor(state.tanks))
    expect(next.tanks[0].hp).toBe(100)
  })

  it('obstacles absorb shells', () => {
    const shooter = makeTank({ id: 0, x: 100, y: 500 })
    const target = makeTank({ id: 1, x: 400, y: 500 })
    const state = makeState([shooter, target], {
      obstacles: [{ x: 195, y: 450, width: 50, height: 100 }],
      shells: [{ id: 0, ownerId: 0, x: 190, y: 500, heading: 0, power: 2 }],
    })
    const next = step(state, intentsFor(state.tanks))
    expect(next.shells).toHaveLength(0)
    expect(next.tanks[1].hp).toBe(100)
  })

  it('shells leaving the arena are removed', () => {
    const state = makeState([makeTank({ id: 0 }), makeTank({ id: 1, x: 100, y: 100 })], {
      shells: [{ id: 0, ownerId: 0, x: 1195, y: 500, heading: 0, power: 2 }],
    })
    const next = step(state, intentsFor(state.tanks))
    expect(next.shells).toHaveLength(0)
  })

  it('a killing hit marks the tank dead and notifies survivors', () => {
    const shooter = makeTank({ id: 0, x: 300, y: 500 })
    const target = makeTank({ id: 1, x: 360, y: 500, hp: shellDamage(2) })
    const state = makeState([shooter, target], {
      shells: [{ id: 0, ownerId: 0, x: 345, y: 500, heading: 0, power: 2 }],
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
      shells: [{ id: 0, ownerId: 1, x: 590, y: 500, heading: Math.PI, power: 2 }],
    })
    const next = step(state, intentsFor(state.tanks, { 0: { drive: 1, fire: 2 } }))
    expect(next.tanks[0].x).toBe(600)
    expect(next.shells).toHaveLength(1)
    expect(next.tanks[0].hp).toBe(0)
  })
})

describe('step: variable fire power', () => {
  it('scales cooldown with power', () => {
    for (const power of [1, 2, 3]) {
      const state = makeState([makeTank({ id: 0 })])
      const next = step(state, intentsFor(state.tanks, { 0: { fire: power } }))
      expect(next.tanks[0].cooldown).toBe(cannonCooldownTicks(power))
      expect(next.shells[0].power).toBe(power)
    }
  })

  it('heavy shells deal more damage', () => {
    const shooter = makeTank({ id: 0, x: 300, y: 500 })
    const target = makeTank({ id: 1, x: 360, y: 500 })
    const state = makeState([shooter, target], {
      shells: [{ id: 0, ownerId: 0, x: 345, y: 500, heading: 0, power: 3 }],
    })
    const next = step(state, intentsFor(state.tanks))
    expect(next.tanks[1].hp).toBe(100 - shellDamage(3))
  })

  it('light shells travel faster than heavy shells', () => {
    const state = makeState([makeTank({ id: 0 }), makeTank({ id: 1, x: 100, y: 100 })], {
      shells: [
        { id: 0, ownerId: 0, x: 600, y: 700, heading: 0, power: 1 },
        { id: 1, ownerId: 0, x: 600, y: 800, heading: 0, power: 3 },
      ],
    })
    const next = step(state, intentsFor(state.tanks))
    const light = next.shells.find((shell) => shell.power === 1)
    const heavy = next.shells.find((shell) => shell.power === 3)
    expect(light && heavy && light.x - 600 > heavy.x - 600).toBe(true)
  })

  it('clamps fire power into [1, 3]', () => {
    const state = makeState([makeTank({ id: 0 })])
    const next = step(state, intentsFor(state.tanks, { 0: { fire: 99 } }))
    expect(next.shells[0].power).toBe(3)
  })
})

describe('step: sensor focus', () => {
  it('applies the requested sensor arc, clamped to limits', () => {
    const state = makeState([makeTank({ id: 0 })])
    const narrow = step(state, intentsFor(state.tanks, { 0: { sensorArc: Math.PI / 4 } }))
    expect(narrow.tanks[0].sensorArc).toBeCloseTo(Math.PI / 4)
    const tooWide = step(state, intentsFor(state.tanks, { 0: { sensorArc: Math.PI * 2 } }))
    expect(tooWide.tanks[0].sensorArc).toBeCloseTo(Math.PI * 0.75)
    const tooNarrow = step(state, intentsFor(state.tanks, { 0: { sensorArc: 0.01 } }))
    expect(tooNarrow.tanks[0].sensorArc).toBeCloseTo(Math.PI / 6)
  })
})

describe('step: loadout abilities', () => {
  it('shield absorbs damage, blocks firing, and a broken shield drops', () => {
    const shielded = makeTank({ id: 0, x: 300, y: 500, modules: ['shield'] })
    const enemy = makeTank({ id: 1, x: 900, y: 500 })
    const state = makeState([shielded, enemy])

    const up = step(state, intentsFor(state.tanks, { 0: { shield: true, fire: 2 } }))
    expect(up.tanks[0].fx.shieldTicks).toBeGreaterThan(0)
    expect(up.tanks[0].fx.shieldHp).toBe(25)
    expect(up.shells).toHaveLength(0) // cannot fire while shielded

    // A 20-damage shell: fully absorbed, hp untouched, 5 absorption left.
    const incoming = makeState(
      [up.tanks[0], enemy],
      { shells: [{ id: 0, ownerId: 1, x: 310, y: 500, heading: Math.PI, power: 2 }] },
    )
    const hit = step(incoming, intentsFor(incoming.tanks))
    expect(hit.tanks[0].hp).toBe(100)
    expect(hit.tanks[0].fx.shieldHp).toBe(5)

    // Next 20-damage shell: 5 absorbed, 15 to hp, shield drops immediately.
    const second = makeState(
      [hit.tanks[0], enemy],
      { shells: [{ id: 1, ownerId: 1, x: 310, y: 500, heading: Math.PI, power: 2 }] },
    )
    const broken = step(second, intentsFor(second.tanks))
    expect(broken.tanks[0].hp).toBe(85)
    expect(broken.tanks[0].fx.shieldHp).toBe(0)
    expect(broken.tanks[0].fx.shieldTicks).toBe(0)
  })

  it('abilities are no-ops without the module', () => {
    const state = makeState([makeTank({ id: 0 })])
    const next = step(
      state,
      intentsFor(state.tanks, { 0: { shield: true, boost: true, ping: true } }),
    )
    expect(next.tanks[0].fx).toEqual(state.tanks[0].fx)
    expect(next.events[0].pingResults).toHaveLength(0)
  })

  it('boost speeds the tank up, then fatigue slows it down', () => {
    const booster = makeTank({ id: 0, x: 100, y: 500, modules: ['boost'] })
    const state = makeState([booster])
    const boosted = step(state, intentsFor(state.tanks, { 0: { boost: true, drive: 1 } }))
    expect(boosted.tanks[0].speed).toBeCloseTo(TANK_FORWARD_SPEED * 1.8)
    expect(boosted.tanks[0].fx.boostCooldown).toBeGreaterThan(0)

    // Run the boost out; fatigue should kick in.
    let current = boosted
    for (let i = 0; i < 120; i++) {
      current = step(current, intentsFor(current.tanks, { 0: { drive: 1 } }))
    }
    expect(current.tanks[0].fx.boostTicks).toBe(0)
    expect(current.tanks[0].fx.fatigueTicks).toBeGreaterThan(0)
    expect(current.tanks[0].speed).toBeCloseTo(TANK_FORWARD_SPEED * 0.6)
  })

  it('radar ping reveals everyone to the pinger and the pinger to everyone', () => {
    const pinger = makeTank({ id: 0, x: 100, y: 100, modules: ['radar'] })
    const far = makeTank({ id: 1, x: 1100, y: 900 }) // far outside any sensor
    const dead = makeTank({ id: 2, x: 600, y: 500, alive: false, hp: 0 })
    const state = makeState([pinger, far, dead])
    const next = step(state, intentsFor(state.tanks, { 0: { ping: true } }))
    expect(next.events[0].pingResults).toEqual([
      { id: 1, x: 1100, y: 900, heading: 0, speed: 0 },
    ])
    expect(next.events[1].pinged).toEqual([{ x: 100, y: 100 }])
    expect(next.tanks[0].fx.pingCooldown).toBeGreaterThan(0)

    // On cooldown: a second ping does nothing.
    const again = step(next, intentsFor(next.tanks, { 0: { ping: true } }))
    expect(again.events[0].pingResults).toHaveLength(0)
  })

  it('engine and gyro modules change movement and turret physics', () => {
    const tuned = makeTank({ id: 0, x: 100, y: 500, modules: ['engine', 'gyro'] })
    const state = makeState([tuned])
    const next = step(
      state,
      intentsFor(state.tanks, { 0: { drive: 1, turretTurn: { kind: 'rate', value: 1 } } }),
    )
    expect(next.tanks[0].speed).toBeCloseTo(TANK_FORWARD_SPEED * 1.25)
    expect(next.tanks[0].turretHeading).toBeCloseTo(TURRET_ROTATION_SPEED * 1.5 * TICK_SECONDS)
  })
})

describe('step: determinism and immutability', () => {
  it('does not mutate the input state', () => {
    const state = makeState([makeTank({ id: 0 }), makeTank({ id: 1, x: 200, y: 200 })])
    const frozen = JSON.parse(JSON.stringify(state))
    step(state, intentsFor(state.tanks, { 0: { drive: 1, fire: 2 } }))
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
