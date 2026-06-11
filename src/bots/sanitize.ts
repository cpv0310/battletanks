import { MAX_TEAM_MESSAGES_PER_TICK, MAX_TEAM_MESSAGE_BYTES } from '../config'
import type { TankIntents, TurnCommand } from '../core/types'
import { clamp } from '../core/geometry'

const DEG_TO_RAD = Math.PI / 180

export interface BotOutput {
  readonly intents: Partial<TankIntents>
  readonly teamMessages: ReadonlyArray<unknown>
}

const EMPTY_OUTPUT: BotOutput = { intents: {}, teamMessages: [] }

/**
 * Validate and convert a bot's raw command JSON (degrees, snake_case) into
 * engine intents (radians, clamped) plus capped team messages. Untrusted
 * input: anything malformed is dropped rather than thrown, so a buggy bot
 * only loses that command.
 */
export function sanitizeBotOutput(rawJson: string): BotOutput {
  let raw: unknown
  try {
    raw = JSON.parse(rawJson)
  } catch {
    return EMPTY_OUTPUT
  }
  if (typeof raw !== 'object' || raw === null) return EMPTY_OUTPUT
  const record = raw as Record<string, unknown>

  const intents: { -readonly [K in keyof TankIntents]?: TankIntents[K] } = {}
  if (isFiniteNumber(record.drive)) intents.drive = clamp(record.drive, -1, 1)
  const turn = parseTurn(record.turn)
  if (turn) intents.turn = turn
  const turretTurn = parseTurn(record.turret_turn)
  if (turretTurn) intents.turretTurn = turretTurn
  if (record.fire === true) intents.fire = true

  return { intents, teamMessages: parseTeamMessages(record.team_messages) }
}

function parseTeamMessages(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  const messages: unknown[] = []
  for (const message of value) {
    if (messages.length >= MAX_TEAM_MESSAGES_PER_TICK) break
    try {
      if (JSON.stringify(message).length <= MAX_TEAM_MESSAGE_BYTES) {
        messages.push(message)
      }
    } catch {
      // unserializable message: drop it
    }
  }
  return messages
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
