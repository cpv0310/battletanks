import { MAX_PLAYERS, MIN_PLAYERS, TANK_COLORS } from '../config'
import { MAP_KINDS, type MapKind } from '../core/arena'
import { SAMPLE_SCRIPTS } from '../bots/samples'
import type { PlayerConfig } from '../bots/protocol'
import { BlocksEditor } from '../blocks/editor'
import { blocksJsonToPython } from '../blocks/generator'
import { BRAWLER_BLOCKS_JSON, STARTER_BLOCKS_JSON } from '../blocks/sample'
import { button, el, option } from './dom'
import { deleteScript, loadSavedScripts, saveScript, type ScriptMode } from './storage'

interface LibraryEntry {
  id: string
  name: string
  source: string
  kind: 'sample' | 'saved'
  mode: ScriptMode
  blocksJson: string | null
}

interface PlayerRow {
  name: string
  scriptId: string
  team: number | null
}

export interface MatchSetup {
  readonly players: ReadonlyArray<PlayerConfig>
  readonly seed: number
  readonly map: MapKind
}

/**
 * Setup screen: script library (samples + scripts saved in localStorage),
 * a per-script Code/Blocks editing mode toggle (textarea vs. drag-and-drop
 * Blockly workspace that compiles to Python), player roster, and match
 * settings. Edits live in working copies; Save persists them.
 */
export class SetupPanel {
  readonly root: HTMLElement
  private readonly onStart: (setup: MatchSetup) => void
  private library: LibraryEntry[] = []
  private players: PlayerRow[] = []
  private selectedId = ''
  private blocksEditor: BlocksEditor | null = null

  private librarySelect!: HTMLSelectElement
  private codeModeButton!: HTMLButtonElement
  private blocksModeButton!: HTMLButtonElement
  private editor!: HTMLTextAreaElement
  private blocksHost!: HTMLElement
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
      { name: 'Player 1', scriptId: this.library[0].id, team: null },
      { name: 'Player 2', scriptId: this.library[1 % this.library.length].id, team: null },
    ]
    this.root = this.build()
    this.refresh()
  }

  private sampleEntries(): LibraryEntry[] {
    const codeSamples: LibraryEntry[] = SAMPLE_SCRIPTS.map((sample) => ({
      id: `sample:${sample.name}`,
      name: sample.name,
      source: sample.source,
      kind: 'sample',
      mode: 'code',
      blocksJson: null,
    }))
    return [
      ...codeSamples,
      {
        id: 'sample:Block Brawler',
        name: 'Block Brawler',
        source: blocksJsonToPython(BRAWLER_BLOCKS_JSON),
        kind: 'sample',
        mode: 'blocks',
        blocksJson: BRAWLER_BLOCKS_JSON,
      },
    ]
  }

  private reloadLibrary(): void {
    const working = new Map(this.library.map((entry) => [entry.id, entry]))
    const samples = this.sampleEntries().map(
      (fresh) => working.get(fresh.id) ?? fresh,
    )
    const saved: LibraryEntry[] = loadSavedScripts(localStorage).map((script) => ({
      id: `saved:${script.name}`,
      name: script.name,
      source: script.source,
      kind: 'saved',
      mode: script.mode,
      blocksJson: script.blocks,
    }))
    this.library = [...samples, ...saved]
  }

  private build(): HTMLElement {
    this.librarySelect = el('select', { className: 'select' })
    this.librarySelect.addEventListener('change', () => {
      this.selectedId = this.librarySelect.value
      this.refresh()
    })

    this.codeModeButton = button('Code', () => this.switchMode('code'), 'btn btn-mode')
    this.blocksModeButton = button('Blocks', () => this.switchMode('blocks'), 'btn btn-mode')

    this.editor = el('textarea', { className: 'editor' })
    this.editor.spellcheck = false
    this.editor.addEventListener('input', () => {
      const entry = this.selected()
      if (entry) entry.source = this.editor.value
    })

    this.blocksHost = el('div', { className: 'blocks-host hidden' })

    this.nameInput = el('input', { className: 'input input-name' })
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
      el('div', { className: 'row' }, [
        this.librarySelect,
        el('span', { className: 'mode-toggle' }, [this.codeModeButton, this.blocksModeButton]),
      ]),
      this.editor,
      this.blocksHost,
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

  private switchMode(mode: ScriptMode): void {
    const entry = this.selected()
    if (!entry || entry.mode === mode) return
    entry.mode = mode
    if (mode === 'blocks' && entry.blocksJson === null) {
      entry.blocksJson = STARTER_BLOCKS_JSON
      entry.source = blocksJsonToPython(STARTER_BLOCKS_JSON)
    }
    this.refresh()
  }

  private ensureBlocksEditor(): BlocksEditor {
    if (!this.blocksEditor) {
      this.blocksEditor = new BlocksEditor(this.blocksHost, () => this.handleBlocksChange())
    }
    return this.blocksEditor
  }

  private handleBlocksChange(): void {
    const entry = this.selected()
    if (!entry || entry.mode !== 'blocks' || !this.blocksEditor) return
    entry.blocksJson = this.blocksEditor.toJson()
    entry.source = this.blocksEditor.toPython()
  }

  private refresh(): void {
    this.librarySelect.replaceChildren()
    for (const entry of this.library) {
      this.librarySelect.append(option(entry.id, entryLabel(entry)))
    }
    const entry = this.selected() ?? this.library[0]
    this.selectedId = entry.id
    this.librarySelect.value = entry.id
    this.nameInput.value = entry.kind === 'sample' ? `My ${entry.name}` : entry.name
    this.deleteButton.disabled = entry.kind === 'sample'

    const blocksMode = entry.mode === 'blocks'
    this.codeModeButton.classList.toggle('btn-mode-active', !blocksMode)
    this.blocksModeButton.classList.toggle('btn-mode-active', blocksMode)
    this.editor.classList.toggle('hidden', blocksMode)
    this.blocksHost.classList.toggle('hidden', !blocksMode)

    if (blocksMode) {
      const editor = this.ensureBlocksEditor()
      editor.load(entry.blocksJson)
      editor.resize()
      this.statusLine.textContent =
        'Drag blocks from the toolbox to build your tank. The blocks compile to Python ' +
        '(flip to Code to see it) and Save stores them in this browser.'
    } else {
      this.editor.value = entry.source
      this.statusLine.textContent =
        entry.blocksJson !== null
          ? 'Generated from blocks — edits here are kept, but flipping back to Blocks rebuilds the code from the blocks.'
          : entry.kind === 'sample'
            ? 'Samples are built in — edits apply to the next battle; Save stores your copy.'
            : 'Saved in this browser (localStorage).'
    }
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
        scriptSelect.append(option(entry.id, entryLabel(entry)))
      }
      scriptSelect.value = this.library.some((entry) => entry.id === player.scriptId)
        ? player.scriptId
        : this.library[0].id
      player.scriptId = scriptSelect.value
      scriptSelect.addEventListener('change', () => {
        player.scriptId = scriptSelect.value
      })

      const teamSelect = el('select', { className: 'select select-team' })
      teamSelect.append(option('none', 'No team'))
      for (let team = 1; team <= MAX_PLAYERS / 2; team++) {
        teamSelect.append(option(String(team), `Team ${team}`))
      }
      teamSelect.value = player.team === null ? 'none' : String(player.team)
      teamSelect.addEventListener('change', () => {
        player.team = teamSelect.value === 'none' ? null : Number(teamSelect.value)
      })

      const remove = button('✕', () => {
        this.players.splice(index, 1)
        this.renderPlayers()
      }, 'btn btn-icon')
      remove.disabled = this.players.length <= MIN_PLAYERS

      this.playersContainer.append(
        el('div', { className: 'player-row' }, [swatch, nameInput, scriptSelect, teamSelect, remove]),
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
      team: null,
    })
    this.renderPlayers()
  }

  private handleSave(): void {
    const entry = this.selected()
    if (!entry) return
    try {
      saveScript(localStorage, this.nameInput.value, entry.source, Date.now(), {
        mode: entry.mode,
        blocks: entry.mode === 'blocks' ? entry.blocksJson : null,
      })
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
    this.library = this.library.filter((item) => item.id !== entry.id)
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
      players.push({ name, script: entry.source, team: player.team })
    }
    const teamError = validateTeams(this.players.map((player) => player.team))
    if (teamError) {
      this.showError(teamError)
      return
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

/**
 * Teams need at least 2 tanks each, which also guarantees at most
 * floor(n / 2) teams on a field of n tanks. Returns an error message or null.
 */
function validateTeams(teams: ReadonlyArray<number | null>): string | null {
  const counts = new Map<number, number>()
  for (const team of teams) {
    if (team !== null) counts.set(team, (counts.get(team) ?? 0) + 1)
  }
  for (const [team, count] of counts) {
    if (count < 2) {
      return `Team ${team} has only one tank — teams need at least 2 members (or set the player to No team).`
    }
  }
  return null
}

function entryLabel(entry: LibraryEntry): string {
  const blocks = entry.mode === 'blocks' ? ' ⧉' : ''
  return entry.kind === 'sample' ? `Sample: ${entry.name}${blocks}` : `${entry.name}${blocks}`
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000)
}
