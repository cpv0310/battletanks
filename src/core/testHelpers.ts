import { TANK_HP } from '../config'
import type { Rect, SimState, TankEvents, TankIntents, TankState } from './types'
import { IDLE_EFFECTS, IDLE_INTENTS } from './types'

export function makeTank(overrides: Partial<TankState> & { id: number }): TankState {
  return {
    name: `tank-${overrides.id}`,
    team: null,
    x: 600,
    y: 500,
    heading: 0,
    turretHeading: 0,
    speed: 0,
    hp: TANK_HP,
    cooldown: 0,
    alive: true,
    blocked: false,
    sensorArc: Math.PI / 2,
    modules: [],
    fx: IDLE_EFFECTS,
    ...overrides,
  }
}

const EMPTY_EVENTS: TankEvents = {
  hitByShell: [],
  shellHitEnemy: [],
  collisions: [],
  enemiesDestroyed: [],
  pinged: [],
  pingResults: [],
}

export function makeState(
  tanks: TankState[],
  options: { obstacles?: Rect[]; shells?: SimState['shells']; tick?: number } = {},
): SimState {
  return {
    tick: options.tick ?? 0,
    arena: { width: 1200, height: 1000, obstacles: options.obstacles ?? [] },
    tanks,
    shells: options.shells ?? [],
    nextShellId: (options.shells?.length ?? 0) + 100,
    events: tanks.map(() => EMPTY_EVENTS),
  }
}

export function intentsFor(
  tanks: ReadonlyArray<TankState>,
  overrides: Record<number, Partial<TankIntents>> = {},
): TankIntents[] {
  return tanks.map((tank) => ({ ...IDLE_INTENTS, ...overrides[tank.id] }))
}
