import { describe, expect, it } from 'vitest'
import {
  TANK_FORWARD_SPEED,
  TANK_HP,
  TURRET_ROTATION_SPEED,
} from '../config'
import { MODULES, loadoutCost, tankStats, validateLoadout } from './loadout'

describe('validateLoadout', () => {
  it('accepts an empty loadout and full-budget builds', () => {
    expect(validateLoadout([])).toBeNull()
    expect(validateLoadout(['engine', 'armor', 'gyro'])).toBeNull() // 3+3+2 = 8
    expect(validateLoadout(['radar', 'shield', 'boost'])).toBeNull() // 3+3+2 = 8
  })

  it('rejects unknown modules with a helpful message', () => {
    expect(validateLoadout(['lazer'])).toContain("Unknown module 'lazer'")
  })

  it('rejects duplicates', () => {
    expect(validateLoadout(['gyro', 'gyro'])).toContain('at most once')
  })

  it('rejects over-budget loadouts', () => {
    expect(validateLoadout(['engine', 'armor', 'radar'])).toContain('9 points')
  })
})

describe('tankStats', () => {
  it('stock tank has base stats', () => {
    const stats = tankStats([])
    expect(stats.maxHp).toBe(TANK_HP)
    expect(stats.forwardSpeed).toBe(TANK_FORWARD_SPEED)
    expect(stats.turretRotationSpeed).toBe(TURRET_ROTATION_SPEED)
  })

  it('engine trades hp for speed; armor the reverse', () => {
    const engine = tankStats(['engine'])
    expect(engine.maxHp).toBe(TANK_HP - 20)
    expect(engine.forwardSpeed).toBeCloseTo(TANK_FORWARD_SPEED * 1.25)
    const armor = tankStats(['armor'])
    expect(armor.maxHp).toBe(TANK_HP + 40)
    expect(armor.forwardSpeed).toBeCloseTo(TANK_FORWARD_SPEED * 0.8)
  })

  it('gyro speeds up the turret only', () => {
    const stats = tankStats(['gyro'])
    expect(stats.turretRotationSpeed).toBeCloseTo(TURRET_ROTATION_SPEED * 1.5)
    expect(stats.forwardSpeed).toBe(TANK_FORWARD_SPEED)
  })

  it('every module documents a positive cost', () => {
    for (const module of MODULES) {
      expect(module.cost).toBeGreaterThan(0)
      expect(module.description.length).toBeGreaterThan(0)
    }
    expect(loadoutCost(['engine', 'gyro'])).toBe(5)
  })
})
