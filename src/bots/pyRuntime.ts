import type { PythonRuntime } from './engine'
import type { LogEntry } from './protocol'
import BATTLETANKS_SOURCE from './python/battletanks.py?raw'
import RUNNER_SOURCE from './python/runner.py?raw'

type PyCallable = (...args: unknown[]) => unknown

/** The slice of the Pyodide API we use (browser and Node builds both match). */
export interface PyodideLike {
  runPython(code: string): unknown
  globals: {
    get(name: string): PyCallable
    set(name: string, value: unknown): void
  }
  setStdout(options: { batched: (text: string) => void }): void
  setStderr(options: { batched: (text: string) => void }): void
}

/**
 * Install the battletanks module and the bot runner into a Pyodide instance
 * and expose it as a PythonRuntime. Python stdout/stderr is attributed to
 * whichever bot is currently executing (calls are synchronous).
 */
export function createPythonRuntime(
  pyodide: PyodideLike,
  log: (entry: LogEntry) => void,
): PythonRuntime {
  let currentBotId: number | null = null

  const emit = (kind: 'out' | 'err') => (text: string) => {
    const trimmed = text.replace(/\s+$/, '')
    if (trimmed.length > 0) log({ botId: currentBotId, text: trimmed, kind })
  }
  pyodide.setStdout({ batched: emit('out') })
  pyodide.setStderr({ batched: emit('err') })

  pyodide.globals.set('_BATTLETANKS_SOURCE', BATTLETANKS_SOURCE)
  pyodide.runPython(RUNNER_SOURCE)
  pyodide.runPython('install_battletanks(_BATTLETANKS_SOURCE)')
  const loadBot = pyodide.globals.get('load_bot')
  const tickBot = pyodide.globals.get('tick_bot')
  const destroyBot = pyodide.globals.get('destroy_bot')

  function withBot<T>(botId: number, fn: () => T): T {
    currentBotId = botId
    try {
      return fn()
    } finally {
      currentBotId = null
    }
  }

  return {
    loadBot: (botId, script, seed, infoJson) =>
      withBot(botId, () => String(loadBot(botId, script, seed, infoJson))),
    tickBot: (botId, stateJson) => withBot(botId, () => String(tickBot(botId, stateJson))),
    destroyBot: (botId) => withBot(botId, () => void destroyBot(botId)),
  }
}
