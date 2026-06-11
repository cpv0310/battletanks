export interface Rng {
  /** Next float in [0, 1). */
  next(): number
  /** Integer in [min, max], inclusive. */
  intBetween(min: number, max: number): number
  /** Float in [min, max). */
  floatBetween(min: number, max: number): number
  /** Returns a new shuffled copy; the input array is not modified. */
  shuffle<T>(items: ReadonlyArray<T>): T[]
}

/**
 * Deterministic mulberry32 PRNG. The generator advances internal state on
 * each draw (inherent to a PRNG); everything it returns is a fresh value
 * and `shuffle` never mutates its input.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    intBetween: (min, max) => min + Math.floor(next() * (max - min + 1)),
    floatBetween: (min, max) => min + next() * (max - min),
    shuffle: <T>(items: ReadonlyArray<T>): T[] => {
      const result = [...items]
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        const tmp = result[i]
        result[i] = result[j]
        result[j] = tmp
      }
      return result
    },
  }
}
