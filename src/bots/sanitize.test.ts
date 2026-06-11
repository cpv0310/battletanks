import { describe, expect, it } from 'vitest'
import { sanitizeCommands } from './sanitize'

describe('sanitizeCommands', () => {
  it('parses a full valid command set, converting degrees to radians', () => {
    const result = sanitizeCommands(
      JSON.stringify({
        drive: 0.5,
        turn: { kind: 'rate', value: -0.3 },
        turret_turn: { kind: 'to', target: 90 },
        fire: true,
      }),
    )
    expect(result.drive).toBe(0.5)
    expect(result.turn).toEqual({ kind: 'rate', value: -0.3 })
    expect(result.turretTurn?.kind).toBe('to')
    expect(result.turretTurn?.kind === 'to' && result.turretTurn.target).toBeCloseTo(Math.PI / 2)
    expect(result.fire).toBe(true)
  })

  it('returns an empty object for invalid JSON', () => {
    expect(sanitizeCommands('not json')).toEqual({})
    expect(sanitizeCommands('null')).toEqual({})
    expect(sanitizeCommands('42')).toEqual({})
  })

  it('clamps out-of-range values', () => {
    const result = sanitizeCommands(
      JSON.stringify({ drive: 99, turn: { kind: 'rate', value: -99 } }),
    )
    expect(result.drive).toBe(1)
    expect(result.turn).toEqual({ kind: 'rate', value: -1 })
  })

  it('drops malformed fields without dropping valid ones', () => {
    const result = sanitizeCommands(
      JSON.stringify({
        drive: 'fast',
        turn: { kind: 'rate', value: 'spin' },
        turret_turn: { kind: 'to', target: 45 },
        fire: 'yes',
      }),
    )
    expect(result.drive).toBeUndefined()
    expect(result.turn).toBeUndefined()
    expect(result.fire).toBeUndefined()
    expect(result.turretTurn?.kind).toBe('to')
  })

  it('rejects non-finite numbers', () => {
    expect(sanitizeCommands('{"drive": null}')).toEqual({})
    const result = sanitizeCommands('{"turn": {"kind": "to"}}')
    expect(result.turn).toBeUndefined()
  })

  it('returns empty for an empty command dict', () => {
    expect(sanitizeCommands('{}')).toEqual({})
  })
})
