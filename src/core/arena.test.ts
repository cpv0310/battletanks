import { describe, expect, it } from 'vitest'
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  SPAWN_MIN_SEPARATION,
  SPAWN_OBSTACLE_CLEARANCE,
} from '../config'
import { SPAWN_POINTS, createArena } from './arena'
import { circleIntersectsRect, distance } from './geometry'
import { createRng } from './rng'

describe('SPAWN_POINTS', () => {
  it('provides eight spawn points inside the arena', () => {
    expect(SPAWN_POINTS).toHaveLength(8)
    for (const spawn of SPAWN_POINTS) {
      expect(spawn.x).toBeGreaterThan(0)
      expect(spawn.x).toBeLessThan(ARENA_WIDTH)
      expect(spawn.y).toBeGreaterThan(0)
      expect(spawn.y).toBeLessThan(ARENA_HEIGHT)
    }
  })

  it('keeps all spawn points at least SPAWN_MIN_SEPARATION apart', () => {
    for (let i = 0; i < SPAWN_POINTS.length; i++) {
      for (let j = i + 1; j < SPAWN_POINTS.length; j++) {
        expect(distance(SPAWN_POINTS[i], SPAWN_POINTS[j])).toBeGreaterThanOrEqual(
          SPAWN_MIN_SEPARATION,
        )
      }
    }
  })
})

describe('createArena', () => {
  it('open map has no obstacles', () => {
    expect(createArena('open', createRng(1)).obstacles).toHaveLength(0)
  })

  it('pillars map keeps obstacles clear of spawn points', () => {
    const arena = createArena('pillars', createRng(1))
    expect(arena.obstacles.length).toBeGreaterThan(0)
    for (const rect of arena.obstacles) {
      for (const spawn of SPAWN_POINTS) {
        expect(circleIntersectsRect(spawn, SPAWN_OBSTACLE_CLEARANCE, rect)).toBe(false)
      }
    }
  })

  it('scatter map is deterministic by seed', () => {
    const a = createArena('scatter', createRng(123))
    const b = createArena('scatter', createRng(123))
    expect(a.obstacles).toEqual(b.obstacles)
  })

  it('scatter map respects spawn clearance and bounds', () => {
    for (const seed of [1, 42, 999]) {
      const arena = createArena('scatter', createRng(seed))
      expect(arena.obstacles.length).toBeGreaterThan(0)
      for (const rect of arena.obstacles) {
        expect(rect.x).toBeGreaterThanOrEqual(0)
        expect(rect.y).toBeGreaterThanOrEqual(0)
        expect(rect.x + rect.width).toBeLessThanOrEqual(ARENA_WIDTH)
        expect(rect.y + rect.height).toBeLessThanOrEqual(ARENA_HEIGHT)
        for (const spawn of SPAWN_POINTS) {
          expect(circleIntersectsRect(spawn, SPAWN_OBSTACLE_CLEARANCE, rect)).toBe(false)
        }
      }
    }
  })

  it('scatter map coverage stays within spec bounds', () => {
    for (const seed of [1, 42, 999]) {
      const arena = createArena('scatter', createRng(seed))
      const coverage =
        arena.obstacles.reduce((sum, r) => sum + r.width * r.height, 0) /
        (ARENA_WIDTH * ARENA_HEIGHT)
      expect(coverage).toBeGreaterThan(0.03)
      expect(coverage).toBeLessThan(0.15)
    }
  })
})
