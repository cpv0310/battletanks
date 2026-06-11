import {
  BOT_BUDGET_MS,
  BOT_OVERRUN_LIMIT,
  TANK_RADIUS,
  TICK_RATE,
  WALL_CONTACT_EPSILON,
} from '../config'
import { createMatch, evaluateMatch, type MatchResult } from '../core/match'
import type { MapKind } from '../core/arena'
import { createRng } from '../core/rng'
import { senseAll } from '../core/sensor'
import { step } from '../core/step'
import {
  IDLE_INTENTS,
  type SensorReading,
  type SimState,
  type TankIntents,
  type TankState,
} from '../core/types'
import type { BotStatus, LogEntry, PlayerConfig, Snapshot } from './protocol'
import { sanitizeBotOutput } from './sanitize'

interface TeamMessage {
  readonly fromId: number
  readonly tick: number
  readonly data: unknown
}

/** The Python calls the engine needs; implemented over Pyodide. */
export interface PythonRuntime {
  loadBot(botId: number, script: string, seed: number, infoJson: string): void
  tickBot(botId: number, stateJson: string): string
  destroyBot(botId: number): void
}

interface MutableBotStatus {
  inert: boolean
  crashed: boolean
  overruns: number
}

const RAD_TO_DEG = 180 / Math.PI

/**
 * Drives a full match: builds per-bot state, runs each bot through the
 * Python runtime, sanitizes commands, and steps the deterministic core sim.
 * Runtime-agnostic so it can run in the worker (real Pyodide) and in tests.
 */
export class MatchEngine {
  private readonly runtime: PythonRuntime
  private readonly log: (entry: LogEntry) => void
  private readonly tickOrder: ReadonlyArray<number>
  private sim: SimState
  private intents: TankIntents[]
  private botStatus: MutableBotStatus[]
  private matchResult: MatchResult | null = null
  /** Team messages awaiting delivery on the next tick, per recipient. */
  private mailbox: TeamMessage[][]
  /** Messages being delivered to each tank during the current tick. */
  private inbox: TeamMessage[][]

  constructor(
    runtime: PythonRuntime,
    players: ReadonlyArray<PlayerConfig>,
    seed: number,
    map: MapKind,
    log: (entry: LogEntry) => void,
  ) {
    this.runtime = runtime
    this.log = log
    this.sim = createMatch(
      players.map((player) => ({ name: player.name, team: player.team ?? null })),
      seed,
      map,
    )
    this.intents = this.sim.tanks.map(() => IDLE_INTENTS)
    this.botStatus = this.sim.tanks.map(() => ({ inert: false, crashed: false, overruns: 0 }))
    this.mailbox = this.sim.tanks.map(() => [])
    this.inbox = this.sim.tanks.map(() => [])
    this.tickOrder = createRng(seed ^ 0x5f3759df).shuffle(this.sim.tanks.map((tank) => tank.id))

    for (const tank of this.sim.tanks) {
      try {
        this.runtime.loadBot(tank.id, players[tank.id].script, seed + tank.id, JSON.stringify({
          id: tank.id,
          name: tank.name,
          arena: { width: this.sim.arena.width, height: this.sim.arena.height },
          match_players: this.sim.tanks.length,
          team: tank.team,
        }))
      } catch (error) {
        this.botStatus[tank.id] = { inert: true, crashed: true, overruns: 0 }
        this.log({ botId: tank.id, text: describeError(error), kind: 'err' })
        this.log({ botId: tank.id, text: 'Bot failed to load and will sit idle.', kind: 'info' })
      }
    }
  }

  get result(): MatchResult | null {
    return this.matchResult
  }

  snapshot(): Snapshot {
    return {
      sim: this.sim,
      botStatus: this.botStatus.map((status): BotStatus => ({ ...status })),
      result: this.matchResult,
    }
  }

  advance(ticks: number): void {
    for (let i = 0; i < ticks && this.matchResult === null; i++) {
      this.runOneTick()
    }
  }

  private runOneTick(): void {
    const readings = senseAll(this.sim)
    const aliveCount = this.sim.tanks.filter((tank) => tank.alive).length

    // Messages sent last tick are delivered this tick.
    this.inbox = this.mailbox
    this.mailbox = this.sim.tanks.map(() => [])

    // fire() is one-shot: cleared every tick before bots run.
    this.intents = this.intents.map((intent) => ({ ...intent, fire: false }))

    for (const botId of this.tickOrder) {
      const tank = this.sim.tanks[botId]
      if (!tank.alive || this.botStatus[botId].inert) continue
      this.runBotTick(botId, tank, readings[botId], aliveCount)
    }

    const before = this.sim.tanks
    this.sim = step(this.sim, this.intents)
    this.notifyDeaths(before, this.sim.tanks)
    this.matchResult = evaluateMatch(this.sim)
  }

  private runBotTick(
    botId: number,
    tank: TankState,
    reading: SensorReading,
    aliveCount: number,
  ): void {
    const stateJson = JSON.stringify(
      buildBotState(this.sim, tank, reading, aliveCount, this.inbox[botId]),
    )
    const started = performance.now()
    try {
      const raw = this.runtime.tickBot(botId, stateJson)
      const output = sanitizeBotOutput(typeof raw === 'string' ? raw : '{}')
      this.intents[botId] = { ...this.intents[botId], ...output.intents }
      this.routeTeamMessages(tank, output.teamMessages)
    } catch (error) {
      this.botStatus[botId] = { ...this.botStatus[botId], inert: true, crashed: true }
      this.log({ botId, text: describeError(error), kind: 'err' })
      this.log({ botId, text: 'Bot crashed and is now inert.', kind: 'info' })
      return
    }
    this.trackBudget(botId, performance.now() - started)
  }

  /** Queue messages for every living teammate; delivered next tick. */
  private routeTeamMessages(sender: TankState, messages: ReadonlyArray<unknown>): void {
    if (sender.team === null || messages.length === 0) return
    for (const mate of this.sim.tanks) {
      if (mate.id === sender.id || mate.team !== sender.team || !mate.alive) continue
      for (const data of messages) {
        this.mailbox[mate.id].push({ fromId: sender.id, tick: this.sim.tick, data })
      }
    }
  }

  private trackBudget(botId: number, elapsedMs: number): void {
    const status = this.botStatus[botId]
    if (elapsedMs <= BOT_BUDGET_MS) {
      status.overruns = 0
      return
    }
    status.overruns += 1
    if (status.overruns >= BOT_OVERRUN_LIMIT) {
      this.botStatus[botId] = { ...status, inert: true }
      this.log({
        botId,
        text: `Exceeded the ${BOT_BUDGET_MS}ms budget ${BOT_OVERRUN_LIMIT} ticks in a row; bot is now inert.`,
        kind: 'info',
      })
    }
  }

  private notifyDeaths(
    before: ReadonlyArray<TankState>,
    after: ReadonlyArray<TankState>,
  ): void {
    for (const tank of after) {
      if (!tank.alive && before[tank.id].alive && !this.botStatus[tank.id].crashed) {
        try {
          this.runtime.destroyBot(tank.id)
        } catch (error) {
          this.log({ botId: tank.id, text: describeError(error), kind: 'err' })
        }
      }
    }
  }
}

function buildBotState(
  state: SimState,
  tank: TankState,
  reading: SensorReading,
  aliveCount: number,
  inbox: ReadonlyArray<TeamMessage>,
): Record<string, unknown> {
  const events = state.events[tank.id]
  const wallContact = nearestWallContact(tank, state)
  return {
    tick: state.tick,
    alive_count: aliveCount,
    me: {
      x: tank.x,
      y: tank.y,
      heading: tank.heading * RAD_TO_DEG,
      turret_heading: tank.turretHeading * RAD_TO_DEG,
      turret_relative: (tank.turretHeading - tank.heading) * RAD_TO_DEG,
      speed: tank.speed,
      hp: tank.hp,
      cooldown: tank.cooldown / TICK_RATE,
      stuck: tank.blocked,
      at_wall: wallContact !== null,
      wall_bearing: wallContact,
      team: tank.team,
    },
    team: buildTeamState(state, tank, inbox),
    sensor: {
      tanks: reading.tanks.map((t) => {
        const target = state.tanks[t.id]
        return {
          id: t.id,
          x: target.x,
          y: target.y,
          is_teammate: tank.team !== null && target.team === tank.team,
          distance: t.distance,
          bearing: t.bearing * RAD_TO_DEG,
          heading: t.heading * RAD_TO_DEG,
          speed: t.speed,
        }
      }),
      obstacles: reading.obstacles.map((o) => ({
        distance: o.distance,
        bearing: o.bearing * RAD_TO_DEG,
        rect: o.rect,
      })),
      wall: reading.wall
        ? { distance: reading.wall.distance, bearing: reading.wall.bearing * RAD_TO_DEG }
        : null,
    },
    events: {
      hit_by_shell: events.hitByShell.map((e) => ({
        damage: e.damage,
        bearing: e.bearing * RAD_TO_DEG,
      })),
      shell_hit_enemy: events.shellHitEnemy.map((e) => ({ target_id: e.targetId })),
      collisions: events.collisions.map((e) => ({
        kind: e.kind,
        bearing: e.bearing * RAD_TO_DEG,
      })),
      enemies_destroyed: events.enemiesDestroyed.map((e) => ({ id: e.id })),
    },
  }
}

function buildTeamState(
  state: SimState,
  tank: TankState,
  inbox: ReadonlyArray<TeamMessage>,
): Record<string, unknown> | null {
  if (tank.team === null) return null
  return {
    id: tank.team,
    mates: state.tanks
      .filter((mate) => mate.team === tank.team && mate.id !== tank.id)
      .map((mate) => ({ id: mate.id, name: mate.name, alive: mate.alive })),
    messages: inbox.map((message) => ({
      from_id: message.fromId,
      from_name: state.tanks[message.fromId]?.name ?? `bot ${message.fromId}`,
      tick: message.tick,
      data: message.data,
    })),
  }
}

/**
 * Bearing (degrees, relative to the hull heading) toward the nearest arena
 * wall the hull is touching, or null when not in contact with any wall.
 */
function nearestWallContact(tank: TankState, state: SimState): number | null {
  const walls = [
    { distance: tank.x, angle: Math.PI },
    { distance: state.arena.width - tank.x, angle: 0 },
    { distance: tank.y, angle: -Math.PI / 2 },
    { distance: state.arena.height - tank.y, angle: Math.PI / 2 },
  ]
  const nearest = walls.reduce((a, b) => (a.distance <= b.distance ? a : b))
  if (nearest.distance > TANK_RADIUS + WALL_CONTACT_EPSILON) return null
  return normalizeDegrees((nearest.angle - tank.heading) * RAD_TO_DEG)
}

function normalizeDegrees(degrees: number): number {
  let normalized = degrees % 360
  if (normalized > 180) normalized -= 360
  if (normalized <= -180) normalized += 360
  return normalized
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
