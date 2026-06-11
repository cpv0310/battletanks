import { MATCH_TIME_LIMIT_TICKS, MAX_PLAYERS, MIN_PLAYERS, TANK_HP } from '../config'
import type { SimState, TankEvents, TankState } from './types'
import { SPAWN_POINTS, createArena, type MapKind } from './arena'
import { createRng } from './rng'

export interface MatchResult {
  readonly winners: ReadonlyArray<number>
  readonly reason: 'last-standing' | 'timeout'
}

const EMPTY_EVENTS: TankEvents = {
  hitByShell: [],
  shellHitEnemy: [],
  collisions: [],
  enemiesDestroyed: [],
}

/** Build the initial simulation state for a match. */
export function createMatch(playerNames: ReadonlyArray<string>, seed: number, map: MapKind): SimState {
  if (playerNames.length < MIN_PLAYERS || playerNames.length > MAX_PLAYERS) {
    throw new Error(`Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`)
  }
  const rng = createRng(seed)
  const arena = createArena(map, rng)
  const spawns = rng.shuffle(SPAWN_POINTS).slice(0, playerNames.length)
  const tanks: TankState[] = playerNames.map((name, id) => {
    const heading = rng.floatBetween(-Math.PI, Math.PI)
    return {
      id,
      name,
      x: spawns[id].x,
      y: spawns[id].y,
      heading,
      turretHeading: heading,
      speed: 0,
      hp: TANK_HP,
      cooldown: 0,
      alive: true,
      blocked: false,
    }
  })
  return {
    tick: 0,
    arena,
    tanks,
    shells: [],
    nextShellId: 0,
    events: tanks.map(() => EMPTY_EVENTS),
  }
}

/** Returns the match result, or null while the match is still running. */
export function evaluateMatch(state: SimState): MatchResult | null {
  const alive = state.tanks.filter((tank) => tank.alive)
  if (alive.length <= 1) {
    return { winners: alive.map((tank) => tank.id), reason: 'last-standing' }
  }
  if (state.tick >= MATCH_TIME_LIMIT_TICKS) {
    const maxHp = Math.max(...alive.map((tank) => tank.hp))
    return {
      winners: alive.filter((tank) => tank.hp === maxHp).map((tank) => tank.id),
      reason: 'timeout',
    }
  }
  return null
}
