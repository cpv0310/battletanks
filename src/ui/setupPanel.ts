import { MAX_PLAYERS, MIN_PLAYERS, TANK_COLORS } from '../config'
import { MAP_KINDS, type MapKind } from '../core/arena'
import { SAMPLE_SCRIPTS } from '../bots/samples'
import type { PlayerConfig } from '../bots/protocol'
import { button, el, option } from './dom'
import { deleteScript, loadSavedScripts, saveScript } from './storage'

interface LibraryEntry {
  id: string
  name: string
  source: string
  kind: 'sample' | 'saved'
}

interface PlayerRow {
  name: string
  scriptId: string
}

export interface MatchSetup {
  readonly players: ReadonlyArray<PlayerConfig>
  readonly seed: number
  readonly map: MapKind
}

/**
 * Setup screen: script library (samples + scripts saved in localStorage, with
 * an editor), player roster, and match settings. Edits live in working copies,
 * so an unsaved tweak still applies to the next battle; Save persists it.
 */
export class SetupPanel {
  readonly root: HTMLElement
  private readonly onStart: (setup: MatchSetup) => void
  private library: LibraryEntry[] = []
  private players: PlayerRow[] = []
  private selectedId = ''

  private librarySelect!: HTMLSelectElement
  private editor!: HTMLTextAreaElement
  private nameInput!: HTMLInputElement
  private deleteButton!: HTMLButtonElement
  private statusLine!: HTMLElement
  private playersContainer!: HTMLElement
  private addPlayerButton!: HTMLButtonElement
  private mapSelect!: HTMLSelectElement
  private seedInput!: HTMLInputElement
  private errorLine!: HTMLElement

  constructor(onStart: (setup: MatchSetup) => void) {
    this.onStart = onStart
    this.reloadLibrary()
    this.selectedId = this.library[0].id
    this.players = [
      { name: 'Player 1', scriptId: this.library[0].id },
      { name: 'Player 2', scriptId: this.library[1 % this.library.length].id },
    ]
    this.root = this.build()
    this.refresh()
  }

  private reloadLibrary(): void {
    const working = new Map(this.library.map((entry) => [entry.id, entry.source]))
    const samples: LibraryEntry[] = SAMPLE_SCRIPTS.map((sample) => ({
      id: `sample:${sample.name}`,
      name: sample.name,
      source: working.get(`sample:${sample.name}`) ?? sample.source,
      kind: 'sample',
    }))
    const saved: LibraryEntry[] = loadSavedScripts(localStorage).map((script) => ({
      id: `saved:${script.name}`,
      name: script.name,
      source: script.source,
      kind: 'saved',
    }))
    this.library = [...samples, ...saved]
  }

  private build(): HTMLElement {
    this.librarySelect = el('select', { className: 'select' })
    this.librarySelect.addEventListener('change', () => {
      this.selectedId = this.librarySelect.value
      this.refresh()
    })

    this.editor = el('textarea', { className: 'editor' })
    this.editor.spellcheck = false
    this.editor.addEventListener('input', () => {
      const entry = this.selected()
      if (entry) entry.source = this.editor.value
    })

    this.nameInput = el('input', { className: 'input' })
    this.nameInput.placeholder = 'Script name'
    this.deleteButton = button('Delete', () => this.handleDelete(), 'btn btn-danger')
    this.statusLine = el('div', { className: 'hint' })

    this.playersContainer = el('div', { className: 'players' })
    this.addPlayerButton = button('+ Add player', () => this.handleAddPlayer())

    this.mapSelect = el('select', { className: 'select' })
    for (const map of MAP_KINDS) this.mapSelect.append(option(map.kind, map.label))

    this.seedInput = el('input', { className: 'input input-seed' })
    this.seedInput.type = 'number'
    this.seedInput.value = String(randomSeed())

    this.errorLine = el('div', { className: 'error' })

    return el('div', { className: 'setup-panel' }, [
      el('h2', { text: 'Scripts' }),
      this.librarySelect,
      this.editor,
      el('div', { className: 'row' }, [
        this.nameInput,
        button('Save', () => this.handleSave()),
        this.deleteButton,
      ]),
      this.statusLine,
      el('h2', { text: 'Players' }),
      this.playersContainer,
      this.addPlayerButton,
      el('h2', { text: 'Match' }),
      el('div', { className: 'row' }, [
        el('label', { text: 'Map' }),
        this.mapSelect,
        el('label', { text: 'Seed' }),
        this.seedInput,
        button('🎲', () => {
          this.seedInput.value = String(randomSeed())
        }, 'btn btn-icon'),
      ]),
      button('Start battle', () => this.handleStart(), 'btn btn-primary btn-start'),
      this.errorLine,
    ])
  }

  private selected(): LibraryEntry | undefined {
    return this.library.find((entry) => entry.id === this.selectedId)
  }

  private refresh(): void {
    this.librarySelect.replaceChildren()
    for (const entry of this.library) {
      const label = entry.kind === 'sample' ? `Sample: ${entry.name}` : entry.name
      this.librarySelect.append(option(entry.id, label))
    }
    const entry = this.selected() ?? this.library[0]
    this.selectedId = entry.id
    this.librarySelect.value = entry.id
    this.editor.value = entry.source
    this.nameInput.value = entry.kind === 'sample' ? `My ${entry.name}` : entry.name
    this.deleteButton.disabled = entry.kind === 'sample'
    this.statusLine.textContent =
      entry.kind === 'sample'
        ? 'Samples are built in — edits apply to the next battle; Save stores your copy.'
        : 'Saved in this browser (localStorage).'
    this.renderPlayers()
  }

  private renderPlayers(): void {
    this.playersContainer.replaceChildren()
    this.players.forEach((player, index) => {
      const swatch = el('span', { className: 'swatch' })
      swatch.style.background = `#${TANK_COLORS[index].toString(16).padStart(6, '0')}`

      const nameInput = el('input', { className: 'input input-player' })
      nameInput.value = player.name
      nameInput.addEventListener('input', () => {
        player.name = nameInput.value
      })

      const scriptSelect = el('select', { className: 'select' })
      for (const entry of this.library) {
        const label = entry.kind === 'sample' ? `Sample: ${entry.name}` : entry.name
        scriptSelect.append(option(entry.id, label))
      }
      scriptSelect.value = this.library.some((entry) => entry.id === player.scriptId)
        ? player.scriptId
        : this.library[0].id
      player.scriptId = scriptSelect.value
      scriptSelect.addEventListener('change', () => {
        player.scriptId = scriptSelect.value
      })

      const remove = button('✕', () => {
        this.players.splice(index, 1)
        this.renderPlayers()
      }, 'btn btn-icon')
      remove.disabled = this.players.length <= MIN_PLAYERS

      this.playersContainer.append(
        el('div', { className: 'player-row' }, [swatch, nameInput, scriptSelect, remove]),
      )
    })
    this.addPlayerButton.disabled = this.players.length >= MAX_PLAYERS
  }

  private handleAddPlayer(): void {
    if (this.players.length >= MAX_PLAYERS) return
    const index = this.players.length
    this.players.push({
      name: `Player ${index + 1}`,
      scriptId: this.library[index % this.library.length].id,
    })
    this.renderPlayers()
  }

  private handleSave(): void {
    const entry = this.selected()
    if (!entry) return
    try {
      saveScript(localStorage, this.nameInput.value, this.editor.value, Date.now())
      const savedId = `saved:${this.nameInput.value.trim()}`
      this.reloadLibrary()
      this.selectedId = savedId
      this.showError('')
      this.refresh()
    } catch (error) {
      this.showError(error instanceof Error ? error.message : String(error))
    }
  }

  private handleDelete(): void {
    const entry = this.selected()
    if (!entry || entry.kind !== 'saved') return
    deleteScript(localStorage, entry.name)
    this.reloadLibrary()
    this.selectedId = this.library[0].id
    this.refresh()
  }

  private handleStart(): void {
    const players: PlayerConfig[] = []
    for (const player of this.players) {
      const entry = this.library.find((item) => item.id === player.scriptId)
      if (!entry) {
        this.showError(`Script for ${player.name || 'a player'} no longer exists.`)
        return
      }
      const name = player.name.trim()
      if (name.length === 0) {
        this.showError('Every player needs a name.')
        return
      }
      players.push({ name, script: entry.source })
    }
    const seed = Number.parseInt(this.seedInput.value, 10)
    if (!Number.isFinite(seed)) {
      this.showError('Seed must be a number.')
      return
    }
    this.showError('')
    this.onStart({ players, seed, map: this.mapSelect.value as MapKind })
  }

  private showError(message: string): void {
    this.errorLine.textContent = message
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000)
}
