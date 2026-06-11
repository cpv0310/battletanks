import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  SPAWN_OBSTACLE_CLEARANCE,
} from '../config'
import type { ArenaState, Rect, Vec2 } from './types'
import { circleIntersectsRect } from './geometry'
import type { Rng } from './rng'

export type MapKind = 'open' | 'pillars' | 'scatter'

export const MAP_KINDS: ReadonlyArray<{ kind: MapKind; label: string }> = [
  { kind: 'pillars', label: 'Pillars (symmetric)' },
  { kind: 'scatter', label: 'Scatter (random)' },
  { kind: 'open', label: 'Open (no obstacles)' },
]

/**
 * Eight spawn points around the arena perimeter — four corners and four edge
 * midpoints — all mutually at least SPAWN_MIN_SEPARATION apart.
 */
export const SPAWN_POINTS: ReadonlyArray<Vec2> = [
  { x: 130, y: 130 },
  { x: ARENA_WIDTH - 130, y: 130 },
  { x: ARENA_WIDTH - 130, y: ARENA_HEIGHT - 130 },
  { x: 130, y: ARENA_HEIGHT - 130 },
  { x: ARENA_WIDTH / 2, y: 100 },
  { x: ARENA_WIDTH - 100, y: ARENA_HEIGHT / 2 },
  { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT - 100 },
  { x: 100, y: ARENA_HEIGHT / 2 },
]

const PILLARS: ReadonlyArray<Rect> = [
  { x: 280, y: 230, width: 120, height: 80 },
  { x: 800, y: 230, width: 120, height: 80 },
  { x: 280, y: 690, width: 120, height: 80 },
  { x: 800, y: 690, width: 120, height: 80 },
  { x: 540, y: 440, width: 120, height: 120 },
]

const SCATTER_MIN_COVERAGE = 0.05
const SCATTER_MAX_COVERAGE = 0.12
const SCATTER_WALL_GAP = 60
const SCATTER_OBSTACLE_GAP = 70
const SCATTER_MAX_ATTEMPTS = 200

export function createArena(kind: MapKind, rng: Rng): ArenaState {
  const obstacles =
    kind === 'open' ? [] : kind === 'pillars' ? [...PILLARS] : generateScatter(rng)
  return { width: ARENA_WIDTH, height: ARENA_HEIGHT, obstacles }
}

function generateScatter(rng: Rng): Rect[] {
  const targetCoverage = rng.floatBetween(SCATTER_MIN_COVERAGE, SCATTER_MAX_COVERAGE)
  const arenaArea = ARENA_WIDTH * ARENA_HEIGHT
  const obstacles: Rect[] = []
  let coverage = 0

  for (let attempt = 0; attempt < SCATTER_MAX_ATTEMPTS; attempt++) {
    if (coverage / arenaArea >= targetCoverage) break
    const candidate = randomRect(rng)
    if (isPlaceable(candidate, obstacles)) {
      obstacles.push(candidate)
      coverage += candidate.width * candidate.height
    }
  }
  return obstacles
}

function randomRect(rng: Rng): Rect {
  const width = rng.intBetween(60, 180)
  const height = rng.intBetween(60, 180)
  return {
    x: rng.intBetween(SCATTER_WALL_GAP, ARENA_WIDTH - SCATTER_WALL_GAP - width),
    y: rng.intBetween(SCATTER_WALL_GAP, ARENA_HEIGHT - SCATTER_WALL_GAP - height),
    width,
    height,
  }
}

function isPlaceable(candidate: Rect, existing: ReadonlyArray<Rect>): boolean {
  const clearOfSpawns = SPAWN_POINTS.every(
    (spawn) => !circleIntersectsRect(spawn, SPAWN_OBSTACLE_CLEARANCE, candidate),
  )
  if (!clearOfSpawns) return false
  return existing.every((rect) => !rectsOverlapWithGap(candidate, rect, SCATTER_OBSTACLE_GAP))
}

function rectsOverlapWithGap(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x - gap < b.x + b.width &&
    a.x + a.width + gap > b.x &&
    a.y - gap < b.y + b.height &&
    a.y + a.height + gap > b.y
  )
}
