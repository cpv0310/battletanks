export const ARENA_WIDTH = 1200
export const ARENA_HEIGHT = 1000

export const TICK_RATE = 60
export const TICK_SECONDS = 1 / TICK_RATE

/** Match time limit: 3 minutes of simulated time. */
export const MATCH_TIME_LIMIT_TICKS = 3 * 60 * TICK_RATE

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8

export const TANK_HP = 100
export const TANK_WIDTH = 40
export const TANK_HEIGHT = 30
/** Collision radius approximating the 40x30 hull. */
export const TANK_RADIUS = 17

/** Tank speeds in pixels per second. */
export const TANK_FORWARD_SPEED = 150
export const TANK_REVERSE_SPEED = 75

/** Rotation speeds in radians per second (90 and 180 deg/s). */
export const HULL_ROTATION_SPEED = Math.PI / 2
export const TURRET_ROTATION_SPEED = Math.PI

/**
 * Variable fire power (a Robocode-style wager). Damage, shell speed, and
 * cooldown all scale with power, keeping DPS flat: light shots are fast and
 * frequent, heavy shots hit hard but travel slower and lock the cannon
 * longer. Power 2 reproduces the original cannon exactly.
 */
export const MIN_FIRE_POWER = 1
export const MAX_FIRE_POWER = 3
export const DEFAULT_FIRE_POWER = 2
export const SHELL_DAMAGE_PER_POWER = 10
export const SHELL_SPEED_BASE = 700
export const SHELL_SPEED_PER_POWER = 50
export const COOLDOWN_TICKS_PER_POWER = TICK_RATE / 2

export const SHELL_RADIUS = 3
/** Shells spawn this far from the tank center, outside TANK_RADIUS. */
export const MUZZLE_OFFSET = 26

export function shellDamage(power: number): number {
  return SHELL_DAMAGE_PER_POWER * power
}

export function shellSpeed(power: number): number {
  return SHELL_SPEED_BASE - SHELL_SPEED_PER_POWER * power
}

export function cannonCooldownTicks(power: number): number {
  return Math.round(COOLDOWN_TICKS_PER_POWER * power)
}

/** A hull within this many px of a wall (beyond TANK_RADIUS) counts as touching it. */
export const WALL_CONTACT_EPSILON = 3

/**
 * Sensor: an arc centered on the turret heading. Bots may trade arc width
 * for range (and vice versa); range scales so the swept area stays constant.
 * Defaults: 90 degrees at 350 px.
 */
export const SENSOR_ARC = Math.PI / 2
export const SENSOR_RANGE = 350
export const SENSOR_MIN_ARC = Math.PI / 6
export const SENSOR_MAX_ARC = Math.PI * 0.75
/** The 30° "laser focus" floor sees exactly this far. */
export const SENSOR_MIN_ARC_RANGE = 750

const SENSOR_NARROW_ARC = Math.PI / 4

/**
 * Range for a given arc. Narrowing buys disproportionate reach:
 * 30° = 750 px (laser focus), 45° ≈ 589 px ((90/arc)^0.75), 90° = 350 px,
 * 135° ≈ 286 px (area-constant ^0.5 above 90°). Piecewise but continuous:
 * 30–45° blends linearly between the 750 px and ~589 px anchors.
 */
export function sensorRange(arc: number): number {
  if (arc < SENSOR_NARROW_ARC) {
    const narrowRange = SENSOR_RANGE * Math.pow(SENSOR_ARC / SENSOR_NARROW_ARC, 0.75)
    const t = (arc - SENSOR_MIN_ARC) / (SENSOR_NARROW_ARC - SENSOR_MIN_ARC)
    return SENSOR_MIN_ARC_RANGE + t * (narrowRange - SENSOR_MIN_ARC_RANGE)
  }
  const ratio = SENSOR_ARC / arc
  return SENSOR_RANGE * Math.pow(ratio, arc < SENSOR_ARC ? 0.75 : 0.5)
}

export const SPAWN_MIN_SEPARATION = 250
export const SPAWN_OBSTACLE_CLEARANCE = 80

/** Per-tick CPU budget for a bot, and how many consecutive overruns make it inert. */
export const BOT_BUDGET_MS = 10
export const BOT_OVERRUN_LIMIT = 120

/** Team channel limits: messages per bot per tick and serialized size each. */
export const MAX_TEAM_MESSAGES_PER_TICK = 4
export const MAX_TEAM_MESSAGE_BYTES = 512

/** Loadout: points each tank may spend on modules (declared in its script). */
export const LOADOUT_POINTS = 8

export const ENGINE_SPEED_MULT = 1.25
export const ENGINE_HP_PENALTY = 20
export const ARMOR_HP_BONUS = 40
export const ARMOR_SPEED_MULT = 0.8
export const GYRO_TURRET_MULT = 1.5

export const PING_COOLDOWN_TICKS = 5 * TICK_RATE
export const SHIELD_ABSORB = 25
export const SHIELD_DURATION_TICKS = 3 * TICK_RATE
export const SHIELD_COOLDOWN_TICKS = 10 * TICK_RATE
export const BOOST_SPEED_MULT = 1.8
export const BOOST_DURATION_TICKS = 2 * TICK_RATE
export const BOOST_FATIGUE_MULT = 0.6
export const BOOST_FATIGUE_TICKS = 2 * TICK_RATE
export const BOOST_COOLDOWN_TICKS = 10 * TICK_RATE

export const TANK_COLORS = [
  0x4caf50, 0xef5350, 0x42a5f5, 0xffca28, 0xab47bc, 0x26c6da, 0xff7043, 0xd4e157,
] as const
