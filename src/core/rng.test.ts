import { describe, expect, it } from 'vitest'
import { createRng } from './rng'

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a.next()).not.toBe(b.next())
  })

  it('returns values in [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('intBetween covers the inclusive range', () => {
    const rng = createRng(3)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) seen.add(rng.intBetween(1, 4))
    expect([...seen].sort()).toEqual([1, 2, 3, 4])
  })

  it('floatBetween stays within bounds', () => {
    const rng = createRng(9)
    for (let i = 0; i < 100; i++) {
      const v = rng.floatBetween(-2, 2)
      expect(v).toBeGreaterThanOrEqual(-2)
      expect(v).toBeLessThan(2)
    }
  })

  it('shuffle keeps all elements and does not mutate the input', () => {
    const rng = createRng(5)
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const shuffled = rng.shuffle(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...shuffled].sort()).toEqual(input)
  })
})
