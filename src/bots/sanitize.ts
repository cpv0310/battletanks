import type { TankIntents, TurnCommand } from '../core/types'
import { clamp } from '../core/geometry'

const DEG_TO_RAD = Math.PI / 180

/**
 * Validate and convert a bot's raw command JSON (degrees, snake_case) into
 * engine intents (radians, clamped). Untrusted input: anything malformed is
 * dropped rather than thrown, so a buggy bot only loses that command.
 */
export function sanitizeCommands(rawJson: string): Partial<TankIntents> {
  let raw: unknown
  try {
    raw = JSON.parse(rawJson)
  } catch {
    return {}
  }
  if (typeof raw !== 'object' || raw === null) return {}
  const record = raw as Record<string, unknown>

  const result: { -readonly [K in keyof TankIntents]?: TankIntents[K] } = {}
  if (isFiniteNumber(record.drive)) result.drive = clamp(record.drive, -1, 1)
  const turn = parseTurn(record.turn)
  if (turn) result.turn = turn
  const turretTurn = parseTurn(record.turret_turn)
  if (turretTurn) result.turretTurn = turretTurn
  if (record.fire === true) result.fire = true
  return result
}

function parseTurn(value: unknown): TurnCommand | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (record.kind === 'rate' && isFiniteNumber(record.value)) {
    return { kind: 'rate', value: clamp(record.value, -1, 1) }
  }
  if (record.kind === 'to' && isFiniteNumber(record.target)) {
    return { kind: 'to', target: record.target * DEG_TO_RAD }
  }
  return null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
