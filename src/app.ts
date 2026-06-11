import Phaser from 'phaser'
import { ARENA_HEIGHT, ARENA_WIDTH } from './config'
import { MatchWorker } from './bots/client'
import type { LogEntry, Snapshot } from './bots/protocol'
import { BattleScene } from './scenes/BattleScene'
import { BattlePanel } from './ui/battlePanel'
import { SetupPanel, type MatchSetup } from './ui/setupPanel'
import { el } from './ui/dom'

/** Wires the setup screen, the match worker, and the Phaser battle view. */
export class App {
  private readonly root: HTMLElement
  private readonly scene: BattleScene
  private readonly setupPanel: SetupPanel
  private readonly battlePanel: BattlePanel
  private worker: MatchWorker | null = null
  private running = false
  private paused = false
  private speed = 1
  private lastSetup: MatchSetup | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.setupPanel = new SetupPanel((setup) => this.startMatch(setup))
    this.battlePanel = new BattlePanel({
      onPauseToggle: () => this.togglePause(),
      onSpeedChange: (speed) => {
        this.speed = speed
      },
      onToggleSensors: (visible) => this.scene.setSensorVisibility(visible),
      onRematch: () => {
        if (this.lastSetup) this.startMatch(this.lastSetup)
      },
      onBackToSetup: () => this.backToSetup(),
    })

    const gameHost = el('div', { className: 'game-host' })
    gameHost.id = 'game'
    root.append(
      el('header', { className: 'topbar' }, [
        el('h1', { text: 'BattleTanks' }),
        this.battlePanel.controls,
      ]),
      el('div', { className: 'content' }, [
        this.setupPanel.root,
        el('main', { className: 'battle-area' }, [
          gameHost,
          this.battlePanel.hud,
          this.battlePanel.overlay,
        ]),
      ]),
      this.battlePanel.consoleRoot,
    )
    this.setMode('setup')

    this.scene = new BattleScene()
    this.scene.onFrame = () => this.onFrame()
    new Phaser.Game({
      type: Phaser.AUTO,
      parent: gameHost,
      width: ARENA_WIDTH,
      height: ARENA_HEIGHT,
      backgroundColor: '#16181d',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: this.scene,
    })
  }

  private setMode(mode: 'setup' | 'battle'): void {
    this.root.classList.toggle('mode-setup', mode === 'setup')
    this.root.classList.toggle('mode-battle', mode === 'battle')
  }

  private startMatch(setup: MatchSetup): void {
    this.worker?.terminate()
    this.lastSetup = setup
    this.running = false
    this.paused = false
    this.setMode('battle')

    this.battlePanel.startMatch(setup.players)
    this.scene.resetMatch(setup.players)
    this.battlePanel.showStatus('Starting…')

    this.worker = new MatchWorker({
      onProgress: (message) => this.battlePanel.showStatus(message),
      onInitialized: (snapshot, logs) => {
        this.applySnapshot(snapshot, logs)
        this.battlePanel.showStatus('')
        this.running = true
      },
      onSnapshot: (snapshot, logs) => this.applySnapshot(snapshot, logs),
      onFatal: (message) => {
        this.running = false
        this.battlePanel.showFatal(message)
      },
    })
    this.worker.init(setup.players, setup.seed, setup.map)
  }

  private applySnapshot(snapshot: Snapshot, logs: ReadonlyArray<LogEntry>): void {
    this.scene.setSnapshot(snapshot)
    this.battlePanel.update(snapshot)
    this.battlePanel.appendLogs(logs)
    if (snapshot.result) {
      this.running = false
      this.battlePanel.showResult(snapshot.result)
    }
  }

  private onFrame(): void {
    if (!this.running || this.paused) return
    if (this.worker && !this.worker.isBusy) {
      this.worker.advance(this.speed)
    }
  }

  private togglePause(): void {
    if (!this.running) return
    this.paused = !this.paused
    this.battlePanel.setPaused(this.paused)
  }

  private backToSetup(): void {
    this.worker?.terminate()
    this.worker = null
    this.running = false
    this.setMode('setup')
  }
}
