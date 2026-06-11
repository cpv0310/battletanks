import { TANK_COLORS, TANK_HP, TICK_RATE } from '../config'
import type { MatchResult } from '../core/match'
import type { LogEntry, Snapshot } from '../bots/protocol'
import { button, el, option } from './dom'

const MAX_CONSOLE_LINES = 400

export interface BattleControls {
  onPauseToggle(): void
  onSpeedChange(speed: number): void
  onToggleSensors(visible: boolean): void
  onRematch(): void
  onBackToSetup(): void
}

/** HUD, match controls, bot console, and the result overlay. */
export class BattlePanel {
  readonly hud: HTMLElement
  readonly controls: HTMLElement
  readonly consoleRoot: HTMLElement
  readonly overlay: HTMLElement
  private readonly handlers: BattleControls
  private readonly consoleBody: HTMLElement
  private readonly clock: HTMLElement
  private readonly pauseButton: HTMLButtonElement
  private readonly statusLine: HTMLElement
  private tankCards: HTMLElement[] = []
  private playerNames: string[] = []
  private consoleLines = 0

  constructor(handlers: BattleControls) {
    this.handlers = handlers
    this.hud = el('aside', { className: 'hud' })
    this.clock = el('span', { className: 'clock', text: '0:00' })
    this.pauseButton = button('Pause', () => handlers.onPauseToggle())
    this.statusLine = el('span', { className: 'status-line' })

    const speedSelect = el('select', { className: 'select' })
    for (const speed of [1, 2, 4]) speedSelect.append(option(String(speed), `${speed}×`))
    speedSelect.addEventListener('change', () => {
      handlers.onSpeedChange(Number(speedSelect.value))
    })

    const sensorToggle = el('input', { className: 'checkbox' })
    sensorToggle.type = 'checkbox'
    sensorToggle.checked = true
    sensorToggle.addEventListener('change', () => handlers.onToggleSensors(sensorToggle.checked))

    this.controls = el('div', { className: 'match-controls' }, [
      this.clock,
      this.pauseButton,
      speedSelect,
      el('label', { className: 'toggle' }, [sensorToggle, 'Sensor arcs']),
      button('New setup', () => handlers.onBackToSetup()),
      this.statusLine,
    ])

    this.consoleBody = el('div', { className: 'console-body' })
    this.consoleRoot = el('section', { className: 'console' }, [
      el('div', { className: 'console-title', text: 'Bot console' }),
      this.consoleBody,
    ])

    this.overlay = el('div', { className: 'overlay hidden' })
  }

  startMatch(playerNames: ReadonlyArray<string>): void {
    this.playerNames = [...playerNames]
    this.consoleBody.replaceChildren()
    this.consoleLines = 0
    this.overlay.classList.add('hidden')
    this.setPaused(false)
    this.statusLine.textContent = ''
    this.tankCards = playerNames.map((name, id) => {
      const bar = el('div', { className: 'hp-bar' }, [el('div', { className: 'hp-fill' })])
      const card = el('div', { className: 'tank-card' }, [
        el('div', { className: 'tank-card-head' }, [
          colorDot(id),
          el('span', { className: 'tank-name', text: name }),
        ]),
        bar,
        el('div', { className: 'tank-status', text: 'Ready' }),
      ])
      return card
    })
    this.hud.replaceChildren(...this.tankCards)
  }

  setPaused(paused: boolean): void {
    this.pauseButton.textContent = paused ? 'Resume' : 'Pause'
  }

  showStatus(message: string): void {
    this.statusLine.textContent = message
  }

  update(snapshot: Snapshot): void {
    const seconds = Math.floor(snapshot.sim.tick / TICK_RATE)
    this.clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    snapshot.sim.tanks.forEach((tank, id) => {
      const card = this.tankCards[id]
      if (!card) return
      const fill = card.querySelector<HTMLElement>('.hp-fill')
      if (fill) {
        fill.style.width = `${(tank.hp / TANK_HP) * 100}%`
        fill.classList.toggle('hp-low', tank.hp <= 40)
      }
      const status = card.querySelector<HTMLElement>('.tank-status')
      if (status) {
        const botState = snapshot.botStatus[id]
        status.textContent = !tank.alive
          ? 'Destroyed'
          : botState.crashed
            ? 'Crashed'
            : botState.inert
              ? 'Inert'
              : `${tank.hp} HP`
      }
      card.classList.toggle('tank-dead', !tank.alive)
    })
  }

  appendLogs(logs: ReadonlyArray<LogEntry>): void {
    if (logs.length === 0) return
    for (const entry of logs) {
      const name = entry.botId === null ? 'engine' : this.playerNames[entry.botId] ?? `bot ${entry.botId}`
      const line = el('div', { className: `console-line console-${entry.kind}` }, [
        entry.botId === null ? el('span') : colorDot(entry.botId),
        el('span', { className: 'console-source', text: name }),
        el('span', { text: entry.text }),
      ])
      this.consoleBody.append(line)
      this.consoleLines += 1
    }
    while (this.consoleLines > MAX_CONSOLE_LINES && this.consoleBody.firstChild) {
      this.consoleBody.firstChild.remove()
      this.consoleLines -= 1
    }
    this.consoleBody.scrollTop = this.consoleBody.scrollHeight
  }

  showResult(result: MatchResult): void {
    const title =
      result.winners.length === 1
        ? `🏆 ${this.playerNames[result.winners[0]]} wins!`
        : result.winners.length === 0
          ? 'Mutual destruction — draw!'
          : `Draw between ${result.winners.map((id) => this.playerNames[id]).join(' and ')}`
    const subtitle =
      result.reason === 'timeout' ? 'Time limit reached — decided on HP.' : 'Last tank standing.'
    this.overlay.replaceChildren(
      el('div', { className: 'overlay-card' }, [
        el('h2', { text: title }),
        el('p', { text: subtitle }),
        el('div', { className: 'row row-center' }, [
          button('Rematch (same seed)', () => this.handlers.onRematch(), 'btn btn-primary'),
          button('Back to setup', () => this.handlers.onBackToSetup()),
        ]),
      ]),
    )
    this.overlay.classList.remove('hidden')
  }

  showFatal(message: string): void {
    this.overlay.replaceChildren(
      el('div', { className: 'overlay-card' }, [
        el('h2', { text: 'Match aborted' }),
        el('p', { text: message }),
        el('div', { className: 'row row-center' }, [
          button('Back to setup', () => this.handlers.onBackToSetup(), 'btn btn-primary'),
        ]),
      ]),
    )
    this.overlay.classList.remove('hidden')
  }
}

function colorDot(id: number): HTMLElement {
  const dot = el('span', { className: 'swatch' })
  dot.style.background = `#${(TANK_COLORS[id] ?? 0xffffff).toString(16).padStart(6, '0')}`
  return dot
}
