/// <reference lib="webworker" />
import type { MapKind } from '../core/arena'
import { MatchEngine } from './engine'
import type { LogEntry, PlayerConfig, WorkerRequest, WorkerResponse } from './protocol'
import { createPythonRuntime, type PyodideLike } from './pyRuntime'

const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/'

let engine: MatchEngine | null = null
let logs: LogEntry[] = []

function post(message: WorkerResponse): void {
  self.postMessage(message)
}

function flushLogs(): LogEntry[] {
  const flushed = logs
  logs = []
  return flushed
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.type === 'init') {
    void initialize(request.players, request.seed, request.map).catch((error: unknown) => {
      post({ type: 'fatal', message: error instanceof Error ? error.message : String(error) })
    })
  } else if (request.type === 'advance') {
    try {
      if (!engine) throw new Error('Match not initialized')
      engine.advance(request.ticks)
      post({ type: 'snapshot', snapshot: engine.snapshot(), logs: flushLogs() })
    } catch (error) {
      post({ type: 'fatal', message: error instanceof Error ? error.message : String(error) })
    }
  }
}

async function initialize(
  players: ReadonlyArray<PlayerConfig>,
  seed: number,
  map: MapKind,
): Promise<void> {
  post({ type: 'progress', message: 'Loading Python runtime (first load may take a moment)…' })
  const loader = (await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`)) as {
    loadPyodide(options: { indexURL: string }): Promise<PyodideLike>
  }
  const pyodide = await loader.loadPyodide({ indexURL: PYODIDE_BASE })

  post({ type: 'progress', message: 'Starting bots…' })
  const runtime = createPythonRuntime(pyodide, (entry) => logs.push(entry))
  engine = new MatchEngine(runtime, players, seed, map, (entry) => logs.push(entry))
  post({ type: 'initialized', snapshot: engine.snapshot(), logs: flushLogs() })
}
