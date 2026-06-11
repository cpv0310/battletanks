import { describe, expect, it } from 'vitest'
import { sanitizeBotOutput } from './sanitize'

describe('sanitizeBotOutput', () => {
  it('parses a full valid command set, converting degrees to radians', () => {
    const { intents, teamMessages } = sanitizeBotOutput(
      JSON.stringify({
        drive: 0.5,
        turn: { kind: 'rate', value: -0.3 },
        turret_turn: { kind: 'to', target: 90 },
        fire: true,
      }),
    )
    expect(intents.drive).toBe(0.5)
    expect(intents.turn).toEqual({ kind: 'rate', value: -0.3 })
    expect(intents.turretTurn?.kind).toBe('to')
    expect(intents.turretTurn?.kind === 'to' && intents.turretTurn.target).toBeCloseTo(Math.PI / 2)
    expect(intents.fire).toBe(2)
    expect(teamMessages).toEqual([])
  })

  it('maps fire power: true is the default power, numbers clamp to [1, 3]', () => {
    expect(sanitizeBotOutput('{"fire": true}').intents.fire).toBe(2)
    expect(sanitizeBotOutput('{"fire": 1}').intents.fire).toBe(1)
    expect(sanitizeBotOutput('{"fire": 3}').intents.fire).toBe(3)
    expect(sanitizeBotOutput('{"fire": 99}').intents.fire).toBe(3)
    expect(sanitizeBotOutput('{"fire": 0.2}').intents.fire).toBe(1)
    expect(sanitizeBotOutput('{"fire": 0}').intents.fire).toBeUndefined()
    expect(sanitizeBotOutput('{"fire": -1}').intents.fire).toBeUndefined()
  })

  it('parses ability triggers strictly as booleans', () => {
    const { intents } = sanitizeBotOutput('{"ping": true, "shield": true, "boost": true}')
    expect(intents.ping).toBe(true)
    expect(intents.shield).toBe(true)
    expect(intents.boost).toBe(true)
    const loose = sanitizeBotOutput('{"ping": 1, "shield": "yes", "boost": null}').intents
    expect(loose.ping).toBeUndefined()
    expect(loose.shield).toBeUndefined()
    expect(loose.boost).toBeUndefined()
  })

  it('converts sensor_arc degrees to clamped radians', () => {
    const narrow = sanitizeBotOutput('{"sensor_arc": 45}').intents.sensorArc
    expect(narrow).toBeCloseTo(Math.PI / 4)
    const laser = sanitizeBotOutput('{"sensor_arc": 30}').intents.sensorArc
    expect(laser).toBeCloseTo(Math.PI / 6)
    const tooNarrow = sanitizeBotOutput('{"sensor_arc": 5}').intents.sensorArc
    expect(tooNarrow).toBeCloseTo(Math.PI / 6)
    const clamped = sanitizeBotOutput('{"sensor_arc": 720}').intents.sensorArc
    expect(clamped).toBeCloseTo(Math.PI * 0.75)
    expect(sanitizeBotOutput('{"sensor_arc": "wide"}').intents.sensorArc).toBeUndefined()
  })

  it('returns empty output for invalid JSON', () => {
    expect(sanitizeBotOutput('not json')).toEqual({ intents: {}, teamMessages: [] })
    expect(sanitizeBotOutput('null')).toEqual({ intents: {}, teamMessages: [] })
    expect(sanitizeBotOutput('42')).toEqual({ intents: {}, teamMessages: [] })
  })

  it('clamps out-of-range values', () => {
    const { intents } = sanitizeBotOutput(
      JSON.stringify({ drive: 99, turn: { kind: 'rate', value: -99 } }),
    )
    expect(intents.drive).toBe(1)
    expect(intents.turn).toEqual({ kind: 'rate', value: -1 })
  })

  it('drops malformed fields without dropping valid ones', () => {
    const { intents } = sanitizeBotOutput(
      JSON.stringify({
        drive: 'fast',
        turn: { kind: 'rate', value: 'spin' },
        turret_turn: { kind: 'to', target: 45 },
        fire: 'yes',
      }),
    )
    expect(intents.drive).toBeUndefined()
    expect(intents.turn).toBeUndefined()
    expect(intents.fire).toBeUndefined()
    expect(intents.turretTurn?.kind).toBe('to')
  })

  it('rejects non-finite numbers', () => {
    expect(sanitizeBotOutput('{"drive": null}').intents).toEqual({})
    expect(sanitizeBotOutput('{"turn": {"kind": "to"}}').intents.turn).toBeUndefined()
  })

  it('passes through team messages of any JSON shape', () => {
    const { teamMessages } = sanitizeBotOutput(
      JSON.stringify({ team_messages: [{ x: 100, y: 200 }, 'fall back', 42] }),
    )
    expect(teamMessages).toEqual([{ x: 100, y: 200 }, 'fall back', 42])
  })

  it('caps team messages per tick and drops oversized ones', () => {
    const { teamMessages } = sanitizeBotOutput(
      JSON.stringify({
        team_messages: ['a'.repeat(600), 1, 2, 3, 4, 5, 6],
      }),
    )
    expect(teamMessages).toEqual([1, 2, 3, 4])
  })

  it('ignores a non-array team_messages field', () => {
    expect(sanitizeBotOutput('{"team_messages": "hi"}').teamMessages).toEqual([])
  })
})
