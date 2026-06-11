import { MATCH_TIME_LIMIT_TICKS, MAX_PLAYERS, MIN_PLAYERS, TANK_HP } from '../config'
import type { SimState, TankEvents, TankState } from './types'
import { SPAWN_POINTS, createArena, type MapKind } from './arena'
import { createRng } from './rng'

export interface MatchResult {
  readonly winners: ReadonlyArray<number>
  readonly reason: 'last-standing' | 'timeout'
}

export interface MatchPlayer {
  readonly name: string
  /** Team number, or null for a solo tank. */
  readonly team: number | null
}

const EMPTY_EVENTS: TankEvents = {
  hitByShell: [],
  shellHitEnemy: [],
  collisions: [],
  enemiesDestroyed: [],
}

/** Build the initial simulation state for a match. */
export function createMatch(players: ReadonlyArray<MatchPlayer>, seed: number, map: MapKind): SimState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`)
  }
  const rng = createRng(seed)
  const arena = createArena(map, rng)
  const spawns = rng.shuffle(SPAWN_POINTS).slice(0, players.length)
  const tanks: TankState[] = players.map((player, id) => {
    const heading = rng.floatBetween(-Math.PI, Math.PI)
    return {
      id,
      name: player.name,
      team: player.team,
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

/** Grouping key for win conditions: each solo tank is its own team. */
function teamKey(tank: TankState): string {
  return tank.team === null ? `solo:${tank.id}` : `team:${tank.team}`
}

/** Returns the match result, or null while the match is still running. */
export function evaluateMatch(state: SimState): MatchResult | null {
  const alive = state.tanks.filter((tank) => tank.alive)
  const aliveTeams = new Set(alive.map(teamKey))
  if (aliveTeams.size <= 1) {
    // One team (or nobody) left: its surviving members win together.
    return { winners: alive.map((tank) => tank.id), reason: 'last-standing' }
  }
  if (state.tick >= MATCH_TIME_LIMIT_TICKS) {
    const totals = new Map<string, number>()
    for (const tank of alive) {
      totals.set(teamKey(tank), (totals.get(teamKey(tank)) ?? 0) + tank.hp)
    }
    const maxTotal = Math.max(...totals.values())
    const top = new Set(
      [...totals].filter(([, total]) => total === maxTotal).map(([key]) => key),
    )
    return {
      winners: alive.filter((tank) => top.has(teamKey(tank))).map((tank) => tank.id),
      reason: 'timeout',
    }
  }
  return null
}
