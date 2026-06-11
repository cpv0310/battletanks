const STORAGE_KEY = 'battletanks.scripts.v1'

export type ScriptMode = 'code' | 'blocks'

export interface SavedScript {
  readonly name: string
  readonly source: string
  readonly updatedAt: number
  /** How the script is edited. Older saves without a mode are code. */
  readonly mode: ScriptMode
  /** Serialized Blockly workspace JSON for blocks-mode scripts. */
  readonly blocks: string | null
}

/** Load saved scripts; corrupt or missing data yields an empty list. */
export function loadSavedScripts(storage: Storage): SavedScript[] {
  const raw = storage.getItem(STORAGE_KEY)
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isStoredScript)
      .map(normalize)
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export interface SaveScriptOptions {
  readonly mode?: ScriptMode
  readonly blocks?: string | null
}

/** Save (or overwrite) a script by name; returns the new list. */
export function saveScript(
  storage: Storage,
  name: string,
  source: string,
  now: number,
  options: SaveScriptOptions = {},
): SavedScript[] {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('Script name cannot be empty')
  if (trimmed.length > 60) throw new Error('Script name is too long (max 60 characters)')
  const entry: SavedScript = {
    name: trimmed,
    source,
    updatedAt: now,
    mode: options.mode ?? 'code',
    blocks: options.blocks ?? null,
  }
  const existing = loadSavedScripts(storage).filter((script) => script.name !== trimmed)
  const updated = [...existing, entry].sort((a, b) => a.name.localeCompare(b.name))
  storage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

/** Delete a saved script by name; returns the new list. */
export function deleteScript(storage: Storage, name: string): SavedScript[] {
  const updated = loadSavedScripts(storage).filter((script) => script.name !== name)
  storage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

interface StoredScript {
  name: string
  source: string
  updatedAt: number
  mode?: unknown
  blocks?: unknown
}

function isStoredScript(value: unknown): value is StoredScript {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.name === 'string' &&
    record.name.length > 0 &&
    typeof record.source === 'string' &&
    typeof record.updatedAt === 'number'
  )
}

function normalize(stored: StoredScript): SavedScript {
  return {
    name: stored.name,
    source: stored.source,
    updatedAt: stored.updatedAt,
    mode: stored.mode === 'blocks' ? 'blocks' : 'code',
    blocks: typeof stored.blocks === 'string' ? stored.blocks : null,
  }
}
