import {
  ARMOR_HP_BONUS,
  ARMOR_SPEED_MULT,
  ENGINE_HP_PENALTY,
  ENGINE_SPEED_MULT,
  GYRO_TURRET_MULT,
  LOADOUT_POINTS,
  TANK_FORWARD_SPEED,
  TANK_HP,
  TANK_REVERSE_SPEED,
  TURRET_ROTATION_SPEED,
} from '../config'

export type ModuleId = 'engine' | 'armor' | 'gyro' | 'radar' | 'shield' | 'boost'

export interface ModuleInfo {
  readonly id: ModuleId
  readonly name: string
  readonly cost: number
  readonly description: string
}

export const MODULES: ReadonlyArray<ModuleInfo> = [
  { id: 'engine', name: 'Engine tune', cost: 3, description: '+25% speed, -20 max HP' },
  { id: 'armor', name: 'Armor plating', cost: 3, description: '+40 max HP, -20% speed' },
  { id: 'gyro', name: 'Gyro turret', cost: 2, description: '+50% turret rotation speed' },
  {
    id: 'radar',
    name: 'Radar ping',
    cost: 3,
    description: 'ping(): see every tank for one tick (5s cooldown) — but everyone hears it',
  },
  {
    id: 'shield',
    name: 'Shield',
    cost: 3,
    description: 'shield(): absorb 25 damage for 3s; cannot fire while up (10s cooldown)',
  },
  {
    id: 'boost',
    name: 'Afterburner',
    cost: 2,
    description: 'boost(): +80% speed for 2s, then -40% fatigue for 2s (10s cooldown)',
  },
]

const MODULE_IDS = new Set(MODULES.map((module) => module.id))

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && MODULE_IDS.has(value as ModuleId)
}

export function loadoutCost(modules: ReadonlyArray<ModuleId>): number {
  return modules.reduce(
    (sum, id) => sum + (MODULES.find((module) => module.id === id)?.cost ?? 0),
    0,
  )
}

/** Returns an error message, or null when the loadout is legal. */
export function validateLoadout(modules: ReadonlyArray<string>): string | null {
  for (const id of modules) {
    if (!isModuleId(id)) {
      return `Unknown module '${id}' — valid modules: ${MODULES.map((m) => m.id).join(', ')}`
    }
  }
  if (new Set(modules).size !== modules.length) {
    return 'Each module can be taken at most once'
  }
  const cost = loadoutCost(modules as ModuleId[])
  if (cost > LOADOUT_POINTS) {
    return `Loadout costs ${cost} points but only ${LOADOUT_POINTS} are available`
  }
  return null
}

export interface TankStats {
  readonly maxHp: number
  readonly forwardSpeed: number
  readonly reverseSpeed: number
  readonly turretRotationSpeed: number
}

/** Base stats modified by the tank's passive modules. */
export function tankStats(modules: ReadonlyArray<ModuleId>): TankStats {
  const has = (id: ModuleId) => modules.includes(id)
  const speedMult = (has('engine') ? ENGINE_SPEED_MULT : 1) * (has('armor') ? ARMOR_SPEED_MULT : 1)
  return {
    maxHp: TANK_HP + (has('armor') ? ARMOR_HP_BONUS : 0) - (has('engine') ? ENGINE_HP_PENALTY : 0),
    forwardSpeed: TANK_FORWARD_SPEED * speedMult,
    reverseSpeed: TANK_REVERSE_SPEED * speedMult,
    turretRotationSpeed: TURRET_ROTATION_SPEED * (has('gyro') ? GYRO_TURRET_MULT : 1),
  }
}
