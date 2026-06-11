import { beforeEach, describe, expect, it } from 'vitest'
import { deleteScript, loadSavedScripts, saveScript } from './storage'

function makeFakeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

let storage: Storage

beforeEach(() => {
  storage = makeFakeStorage()
})

describe('script storage', () => {
  it('returns an empty list when nothing is saved', () => {
    expect(loadSavedScripts(storage)).toEqual([])
  })

  it('saves and reloads a script (defaults to code mode)', () => {
    saveScript(storage, 'My Bot', 'print("hi")', 1000)
    expect(loadSavedScripts(storage)).toEqual([
      { name: 'My Bot', source: 'print("hi")', updatedAt: 1000, mode: 'code', blocks: null },
    ])
  })

  it('persists blocks mode and workspace JSON', () => {
    saveScript(storage, 'Blocky', 'generated', 1000, { mode: 'blocks', blocks: '{"blocks":{}}' })
    const [script] = loadSavedScripts(storage)
    expect(script.mode).toBe('blocks')
    expect(script.blocks).toBe('{"blocks":{}}')
  })

  it('normalizes legacy entries without mode/blocks fields', () => {
    storage.setItem(
      'battletanks.scripts.v1',
      JSON.stringify([{ name: 'Old', source: 'x', updatedAt: 5 }]),
    )
    expect(loadSavedScripts(storage)).toEqual([
      { name: 'Old', source: 'x', updatedAt: 5, mode: 'code', blocks: null },
    ])
  })

  it('overwrites a script with the same name', () => {
    saveScript(storage, 'My Bot', 'v1', 1000)
    saveScript(storage, 'My Bot', 'v2', 2000)
    const scripts = loadSavedScripts(storage)
    expect(scripts).toHaveLength(1)
    expect(scripts[0].source).toBe('v2')
  })

  it('sorts scripts by name and trims the name', () => {
    saveScript(storage, 'zeta', 'z', 1)
    saveScript(storage, '  alpha  ', 'a', 2)
    expect(loadSavedScripts(storage).map((s) => s.name)).toEqual(['alpha', 'zeta'])
  })

  it('rejects empty and over-long names', () => {
    expect(() => saveScript(storage, '   ', 'x', 1)).toThrow()
    expect(() => saveScript(storage, 'x'.repeat(61), 'x', 1)).toThrow()
  })

  it('deletes a script by name', () => {
    saveScript(storage, 'a', '1', 1)
    saveScript(storage, 'b', '2', 2)
    deleteScript(storage, 'a')
    expect(loadSavedScripts(storage).map((s) => s.name)).toEqual(['b'])
  })

  it('survives corrupt stored data', () => {
    storage.setItem('battletanks.scripts.v1', '{not json')
    expect(loadSavedScripts(storage)).toEqual([])
    storage.setItem('battletanks.scripts.v1', JSON.stringify([{ bogus: true }, null, 5]))
    expect(loadSavedScripts(storage)).toEqual([])
  })
})
