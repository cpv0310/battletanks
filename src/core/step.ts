import {
  BOOST_COOLDOWN_TICKS,
  BOOST_DURATION_TICKS,
  BOOST_FATIGUE_MULT,
  BOOST_FATIGUE_TICKS,
  BOOST_SPEED_MULT,
  HULL_ROTATION_SPEED,
  MAX_FIRE_POWER,
  MIN_FIRE_POWER,
  MUZZLE_OFFSET,
  PING_COOLDOWN_TICKS,
  SENSOR_MAX_ARC,
  SENSOR_MIN_ARC,
  SHIELD_ABSORB,
  SHIELD_COOLDOWN_TICKS,
  SHIELD_DURATION_TICKS,
  TANK_RADIUS,
  TICK_SECONDS,
  cannonCooldownTicks,
  shellDamage,
  shellSpeed,
} from '../config'
import { tankStats, type ModuleId } from './loadout'
import type {
  CollisionEvent,
  PingContact,
  ShellState,
  SimState,
  TankEffects,
  TankEvents,
  TankIntents,
  TankState,
  TurnCommand,
  Vec2,
} from './types'
import {
  angleBetween,
  circleIntersectsRect,
  clamp,
  clampPointToRect,
  distance,
  relativeAngle,
  segmentCircleHit,
  segmentRectEntry,
  stepAngleToward,
} from './geometry'
import { normalizeAngle, velocityFromAngle } from './movement'

interface MutableEvents {
  hitByShell: { damage: number; bearing: number }[]
  shellHitEnemy: { targetId: number }[]
  collisions: CollisionEvent[]
  enemiesDestroyed: { id: number }[]
  pinged: Vec2[]
  pingResults: PingContact[]
}

/**
 * Advance the simulation by one tick. Pure: returns a new SimState, never
 * mutates the input. `intents` is indexed by tank id.
 */
export function step(state: SimState, intents: ReadonlyArray<TankIntents>): SimState {
  const events: MutableEvents[] = state.tanks.map(() => ({
    hitByShell: [],
    shellHitEnemy: [],
    collisions: [],
    enemiesDestroyed: [],
    pinged: [],
    pingResults: [],
  }))

  const energized = state.tanks.map((tank) =>
    tank.alive ? applyAbilities(tank, intents[tank.id], state.tanks, events) : tank,
  )
  const rotated = energized.map((tank) =>
    tank.alive ? applyRotation(tank, intents[tank.id]) : tank,
  )
  const moved = applyMovement(state, rotated, intents, events)
  const { tanks: cooled, shells: newShells, nextShellId } = applyFiring(
    moved,
    intents,
    state.nextShellId,
  )
  const shellResult = moveShells(state, [...state.shells, ...newShells], cooled, events)
  const finalTanks = applyDeaths(shellResult.tanks, events)

  return {
    tick: state.tick + 1,
    arena: state.arena,
    tanks: finalTanks,
    shells: shellResult.shells,
    nextShellId,
    events: events.map(toReadonlyEvents),
  }
}

/** Tick down effect timers/cooldowns, then trigger requested abilities. */
function applyAbilities(
  tank: TankState,
  intents: TankIntents,
  allTanks: ReadonlyArray<TankState>,
  events: MutableEvents[],
): TankState {
  let fx = tickEffects(tank.fx)
  const has = (id: ModuleId) => tank.modules.includes(id)

  if (intents.ping && has('radar') && fx.pingCooldown === 0) {
    fx = { ...fx, pingCooldown: PING_COOLDOWN_TICKS }
    for (const other of allTanks) {
      if (!other.alive || other.id === tank.id) continue
      events[tank.id].pingResults.push({
        id: other.id,
        x: other.x,
        y: other.y,
        heading: other.heading,
        speed: other.speed,
      })
      // A ping is loud: every tank on the field learns where it came from.
      events[other.id].pinged.push({ x: tank.x, y: tank.y })
    }
  }
  if (intents.shield && has('shield') && fx.shieldCooldown === 0 && fx.shieldTicks === 0) {
    fx = {
      ...fx,
      shieldTicks: SHIELD_DURATION_TICKS,
      shieldHp: SHIELD_ABSORB,
      shieldCooldown: SHIELD_COOLDOWN_TICKS,
    }
  }
  if (
    intents.boost &&
    has('boost') &&
    fx.boostCooldown === 0 &&
    fx.boostTicks === 0 &&
    fx.fatigueTicks === 0
  ) {
    fx = { ...fx, boostTicks: BOOST_DURATION_TICKS, boostCooldown: BOOST_COOLDOWN_TICKS }
  }
  return fx === tank.fx ? tank : { ...tank, fx }
}

function tickEffects(fx: TankEffects): TankEffects {
  const boostExpiring = fx.boostTicks === 1
  const shieldExpiring = fx.shieldTicks === 1
  return {
    shieldHp: shieldExpiring ? 0 : fx.shieldHp,
    shieldTicks: Math.max(0, fx.shieldTicks - 1),
    boostTicks: Math.max(0, fx.boostTicks - 1),
    // Fatigue begins the moment the afterburner cuts out.
    fatigueTicks: boostExpiring ? BOOST_FATIGUE_TICKS : Math.max(0, fx.fatigueTicks - 1),
    pingCooldown: Math.max(0, fx.pingCooldown - 1),
    shieldCooldown: Math.max(0, fx.shieldCooldown - 1),
    boostCooldown: Math.max(0, fx.boostCooldown - 1),
  }
}

function turnRate(command: TurnCommand, current: number, maxRate: number): number {
  if (command.kind === 'rate') return clamp(command.value, -1, 1) * maxRate
  const diff = normalizeAngle(command.target - current)
  return clamp(diff / TICK_SECONDS, -maxRate, maxRate)
}

function applyRotation(tank: TankState, intents: TankIntents): TankState {
  const turretSpeed = tankStats(tank.modules).turretRotationSpeed
  const hullDelta = turnRate(intents.turn, tank.heading, HULL_ROTATION_SPEED) * TICK_SECONDS
  const heading = normalizeAngle(tank.heading + hullDelta)
  // The turret is mounted on the hull, so hull rotation carries it along.
  const carried = normalizeAngle(tank.turretHeading + hullDelta)
  const turretDelta = turnRate(intents.turretTurn, carried, turretSpeed) * TICK_SECONDS
  const turretHeading =
    intents.turretTurn.kind === 'to'
      ? stepAngleToward(carried, intents.turretTurn.target, turretSpeed * TICK_SECONDS)
      : normalizeAngle(carried + turretDelta)
  const sensorArc = clamp(intents.sensorArc, SENSOR_MIN_ARC, SENSOR_MAX_ARC)
  return { ...tank, heading, turretHeading, sensorArc }
}

function applyMovement(
  state: SimState,
  tanks: ReadonlyArray<TankState>,
  intents: ReadonlyArray<TankIntents>,
  events: MutableEvents[],
): TankState[] {
  const positions: TankState[] = [...tanks]
  for (const tank of tanks) {
    if (!tank.alive) continue
    const stats = tankStats(tank.modules)
    const boostMult =
      tank.fx.boostTicks > 0 ? BOOST_SPEED_MULT : tank.fx.fatigueTicks > 0 ? BOOST_FATIGUE_MULT : 1
    const drive = clamp(intents[tank.id].drive, -1, 1)
    const speed = drive * (drive >= 0 ? stats.forwardSpeed : stats.reverseSpeed) * boostMult
    if (speed === 0) {
      positions[tank.id] = { ...positions[tank.id], speed: 0, blocked: false }
      continue
    }
    const current = positions[tank.id]
    const velocity = velocityFromAngle(current.heading, speed)
    const desired = {
      x: current.x + velocity.x * TICK_SECONDS,
      y: current.y + velocity.y * TICK_SECONDS,
    }
    const resolved = resolveMove(state, positions, current, desired)
    if (resolved.collision) events[tank.id].collisions.push(resolved.collision)
    positions[tank.id] = {
      ...current,
      x: resolved.x,
      y: resolved.y,
      speed,
      blocked: resolved.collision !== null,
    }
  }
  return positions
}

interface ResolvedMove {
  x: number
  y: number
  collision: CollisionEvent | null
}

function resolveMove(
  state: SimState,
  positions: ReadonlyArray<TankState>,
  tank: TankState,
  desired: Vec2,
): ResolvedMove {
  const candidates: Vec2[] = [
    desired,
    { x: desired.x, y: tank.y },
    { x: tank.x, y: desired.y },
  ]
  const blocked = findObstruction(state, positions, tank, desired)
  for (const candidate of candidates) {
    if (!findObstruction(state, positions, tank, candidate)) {
      const collision =
        candidate === desired ? null : blocked ?? { kind: 'wall' as const, bearing: 0 }
      return { x: candidate.x, y: candidate.y, collision }
    }
  }
  return { x: tank.x, y: tank.y, collision: blocked }
}

function findObstruction(
  state: SimState,
  positions: ReadonlyArray<TankState>,
  tank: TankState,
  at: Vec2,
): CollisionEvent | null {
  if (
    at.x - TANK_RADIUS < 0 ||
    at.x + TANK_RADIUS > state.arena.width ||
    at.y - TANK_RADIUS < 0 ||
    at.y + TANK_RADIUS > state.arena.height
  ) {
    return { kind: 'wall', bearing: relativeAngle(tank.heading, tank.speed < 0 ? tank.heading + Math.PI : tank.heading) }
  }
  for (const rect of state.arena.obstacles) {
    if (circleIntersectsRect(at, TANK_RADIUS, rect)) {
      const nearest = clampPointToRect(at, rect)
      return { kind: 'obstacle', bearing: relativeAngle(tank.heading, angleBetween(at, nearest)) }
    }
  }
  for (const other of positions) {
    if (other.id === tank.id || !other.alive) continue
    if (distance(at, other) < TANK_RADIUS * 2) {
      return { kind: 'tank', bearing: relativeAngle(tank.heading, angleBetween(at, other)) }
    }
  }
  return null
}

function applyFiring(
  tanks: ReadonlyArray<TankState>,
  intents: ReadonlyArray<TankIntents>,
  nextShellId: number,
): { tanks: TankState[]; shells: ShellState[]; nextShellId: number } {
  const shells: ShellState[] = []
  let shellId = nextShellId
  const updated = tanks.map((tank) => {
    if (!tank.alive) return tank
    const cooldown = Math.max(0, tank.cooldown - 1)
    // The shield interrupts the cannon while it is up.
    if (intents[tank.id].fire > 0 && cooldown === 0 && tank.fx.shieldTicks === 0) {
      const power = clamp(intents[tank.id].fire, MIN_FIRE_POWER, MAX_FIRE_POWER)
      const muzzle = velocityFromAngle(tank.turretHeading, MUZZLE_OFFSET)
      shells.push({
        id: shellId++,
        ownerId: tank.id,
        x: tank.x + muzzle.x,
        y: tank.y + muzzle.y,
        heading: tank.turretHeading,
        power,
      })
      return { ...tank, cooldown: cannonCooldownTicks(power) }
    }
    return { ...tank, cooldown }
  })
  return { tanks: updated, shells, nextShellId: shellId }
}

interface ShellOutcome {
  tanks: TankState[]
  shells: ShellState[]
}

function moveShells(
  state: SimState,
  shells: ReadonlyArray<ShellState>,
  tanks: ReadonlyArray<TankState>,
  events: MutableEvents[],
): ShellOutcome {
  const damage = new Map<number, number>()
  const surviving: ShellState[] = []

  for (const shell of shells) {
    const travel = velocityFromAngle(shell.heading, shellSpeed(shell.power) * TICK_SECONDS)
    const from = { x: shell.x, y: shell.y }
    const to = { x: shell.x + travel.x, y: shell.y + travel.y }
    const hit = firstHit(state, tanks, shell, from, to)

    if (hit === null) {
      if (inBounds(to, state)) surviving.push({ ...shell, x: to.x, y: to.y })
      continue
    }
    if (hit.kind === 'tank') {
      const dealt = shellDamage(shell.power)
      damage.set(hit.targetId, (damage.get(hit.targetId) ?? 0) + dealt)
      const target = tanks[hit.targetId]
      events[hit.targetId].hitByShell.push({
        damage: dealt,
        bearing: relativeAngle(target.heading, angleBetween(target, from)),
      })
      if (tanks[shell.ownerId]?.alive) {
        events[shell.ownerId].shellHitEnemy.push({ targetId: hit.targetId })
      }
    }
  }

  const updatedTanks = tanks.map((tank) => {
    const taken = damage.get(tank.id)
    if (!taken) return tank
    const absorbed = Math.min(tank.fx.shieldHp, taken)
    const shieldHp = tank.fx.shieldHp - absorbed
    // A broken shield drops immediately, freeing the cannon.
    const fx =
      absorbed > 0
        ? { ...tank.fx, shieldHp, shieldTicks: shieldHp === 0 ? 0 : tank.fx.shieldTicks }
        : tank.fx
    return { ...tank, hp: Math.max(0, tank.hp - (taken - absorbed)), fx }
  })
  return { tanks: updatedTanks, shells: surviving }
}

type ShellHit = { t: number; kind: 'obstacle' } | { t: number; kind: 'tank'; targetId: number }

function firstHit(
  state: SimState,
  tanks: ReadonlyArray<TankState>,
  shell: ShellState,
  from: Vec2,
  to: Vec2,
): ShellHit | null {
  let best: ShellHit | null = null
  for (const rect of state.arena.obstacles) {
    const t = segmentRectEntry(from, to, rect)
    if (t !== null && (best === null || t < best.t)) best = { t, kind: 'obstacle' }
  }
  for (const tank of tanks) {
    if (!tank.alive || tank.id === shell.ownerId) continue
    const t = segmentCircleHit(from, to, tank, TANK_RADIUS)
    if (t !== null && (best === null || t < best.t)) {
      best = { t, kind: 'tank', targetId: tank.id }
    }
  }
  return best
}

function inBounds(p: Vec2, state: SimState): boolean {
  return p.x >= 0 && p.x <= state.arena.width && p.y >= 0 && p.y <= state.arena.height
}

function applyDeaths(tanks: ReadonlyArray<TankState>, events: MutableEvents[]): TankState[] {
  const dying = tanks.filter((tank) => tank.alive && tank.hp <= 0)
  if (dying.length === 0) return [...tanks]
  const updated = tanks.map((tank) =>
    tank.alive && tank.hp <= 0 ? { ...tank, alive: false, speed: 0, blocked: false } : tank,
  )
  for (const survivor of updated) {
    if (!survivor.alive) continue
    for (const dead of dying) {
      events[survivor.id].enemiesDestroyed.push({ id: dead.id })
    }
  }
  return updated
}

function toReadonlyEvents(events: MutableEvents): TankEvents {
  return {
    hitByShell: events.hitByShell,
    shellHitEnemy: events.shellHitEnemy,
    collisions: events.collisions,
    enemiesDestroyed: events.enemiesDestroyed,
    pinged: events.pinged,
    pingResults: events.pingResults,
  }
}
