const STORAGE_KEY = 'battletanks.scripts.v1'

export interface SavedScript {
  readonly name: string
  readonly source: string
  readonly updatedAt: number
}

/** Load saved scripts; corrupt or missing data yields an empty list. */
export function loadSavedScripts(storage: Storage): SavedScript[] {
  const raw = storage.getItem(STORAGE_KEY)
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isSavedScript).sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

/** Save (or overwrite) a script by name; returns the new list. */
export function saveScript(
  storage: Storage,
  name: string,
  source: string,
  now: number,
): SavedScript[] {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('Script name cannot be empty')
  if (trimmed.length > 60) throw new Error('Script name is too long (max 60 characters)')
  const existing = loadSavedScripts(storage).filter((script) => script.name !== trimmed)
  const updated = [...existing, { name: trimmed, source, updatedAt: now }].sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  storage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

/** Delete a saved script by name; returns the new list. */
export function deleteScript(storage: Storage, name: string): SavedScript[] {
  const updated = loadSavedScripts(storage).filter((script) => script.name !== name)
  storage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

function isSavedScript(value: unknown): value is SavedScript {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.name === 'string' &&
    record.name.length > 0 &&
    typeof record.source === 'string' &&
    typeof record.updatedAt === 'number'
  )
}
