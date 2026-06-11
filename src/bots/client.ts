import type { MapKind } from '../core/arena'
import type { LogEntry, PlayerConfig, Snapshot, WorkerRequest, WorkerResponse } from './protocol'

export interface MatchWorkerHandlers {
  onProgress(message: string): void
  onInitialized(snapshot: Snapshot, logs: ReadonlyArray<LogEntry>): void
  onSnapshot(snapshot: Snapshot, logs: ReadonlyArray<LogEntry>): void
  onFatal(message: string): void
}

const INIT_TIMEOUT_MS = 120_000
const ADVANCE_TIMEOUT_MS = 8_000

/**
 * Main-thread handle to the match worker. Watchdogs every request so a bot
 * stuck in an infinite loop (which we cannot preempt inside Pyodide) gets the
 * whole worker terminated instead of hanging the page.
 */
export class MatchWorker {
  private readonly worker: Worker
  private readonly handlers: MatchWorkerHandlers
  private watchdog: ReturnType<typeof setTimeout> | null = null
  private terminated = false
  private busy = false

  constructor(handlers: MatchWorkerHandlers) {
    this.handlers = handlers
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.receive(event.data)
    this.worker.onerror = (event) => {
      this.fail(`Worker error: ${event.message || 'unknown'}`)
    }
  }

  get isBusy(): boolean {
    return this.busy
  }

  init(players: ReadonlyArray<PlayerConfig>, seed: number, map: MapKind): void {
    this.send({ type: 'init', players, seed, map }, INIT_TIMEOUT_MS)
  }

  advance(ticks: number): void {
    if (this.busy || this.terminated) return
    this.send({ type: 'advance', ticks }, ADVANCE_TIMEOUT_MS)
  }

  terminate(): void {
    this.terminated = true
    this.clearWatchdog()
    this.worker.terminate()
  }

  private send(request: WorkerRequest, timeoutMs: number): void {
    if (this.terminated) return
    this.busy = true
    this.clearWatchdog()
    this.watchdog = setTimeout(() => {
      this.fail(
        'A bot script took too long to respond (possible infinite loop). The match was aborted.',
      )
    }, timeoutMs)
    this.worker.postMessage(request)
  }

  private receive(response: WorkerResponse): void {
    if (this.terminated) return
    switch (response.type) {
      case 'progress':
        this.handlers.onProgress(response.message)
        break
      case 'initialized':
        this.settle()
        this.handlers.onInitialized(response.snapshot, response.logs)
        break
      case 'snapshot':
        this.settle()
        this.handlers.onSnapshot(response.snapshot, response.logs)
        break
      case 'fatal':
        this.fail(response.message)
        break
    }
  }

  private settle(): void {
    this.busy = false
    this.clearWatchdog()
  }

  private fail(message: string): void {
    if (this.terminated) return
    this.terminate()
    this.handlers.onFatal(message)
  }

  private clearWatchdog(): void {
    if (this.watchdog !== null) {
      clearTimeout(this.watchdog)
      this.watchdog = null
    }
  }
}
