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

export const SHELL_SPEED = 600
export const SHELL_DAMAGE = 20
export const SHELL_RADIUS = 3
export const CANNON_COOLDOWN_TICKS = TICK_RATE
/** Shells spawn this far from the tank center, outside TANK_RADIUS. */
export const MUZZLE_OFFSET = 26

/** Sensor: 90 degree arc centered on the turret heading. */
export const SENSOR_ARC = Math.PI / 2
export const SENSOR_RANGE = 350

export const SPAWN_MIN_SEPARATION = 250
export const SPAWN_OBSTACLE_CLEARANCE = 80

/** Per-tick CPU budget for a bot, and how many consecutive overruns make it inert. */
export const BOT_BUDGET_MS = 10
export const BOT_OVERRUN_LIMIT = 120

export const TANK_COLORS = [
  0x4caf50, 0xef5350, 0x42a5f5, 0xffca28, 0xab47bc, 0x26c6da, 0xff7043, 0xd4e157,
] as const
