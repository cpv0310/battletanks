import { beforeAll, describe, expect, it } from 'vitest'
import { loadPyodide } from 'pyodide'
import { TANK_FORWARD_SPEED, TANK_HP } from '../config'
import type { LogEntry } from './protocol'
import { MatchEngine, type PythonRuntime } from './engine'
import { createPythonRuntime, type PyodideLike } from './pyRuntime'
import { SAMPLE_SCRIPTS } from './samples'

const DRIVER_BOT = `
from battletanks import Bot

class Driver(Bot):
    def on_tick(self, state):
        self.turn_to(0)
        self.drive(1.0)
        self.fire()
`

const CRASHER_BOT = `
from battletanks import Bot

class Crasher(Bot):
    def on_tick(self, state):
        raise RuntimeError("boom")
`

const TALKER_BOT = `
from battletanks import Bot

class Talker(Bot):
    def on_start(self, info):
        print("hello from", info.name)

    def on_tick(self, state):
        pass
`

const CENTER_SEEKER = `
import math
from battletanks import Bot

class Seeker(Bot):
    def on_start(self, info):
        self.cx = info.arena.width / 2
        self.cy = info.arena.height / 2

    def on_tick(self, state):
        me = state.me
        if math.hypot(self.cx - me.x, self.cy - me.y) > 120:
            self.turn_to(math.degrees(math.atan2(self.cy - me.y, self.cx - me.x)))
            self.drive(1.0)
        else:
            self.drive(0.0)
        if state.sensor.tanks:
            target = state.sensor.tanks[0]
            self.turn_turret_to(me.turret_heading + target.bearing)
            if abs(target.bearing) < 5 and me.cooldown == 0:
                self.fire()
        else:
            self.turn_turret(1.0)

    def on_hit(self, event):
        print("OUCH")
`

let pyodide: PyodideLike

beforeAll(async () => {
  pyodide = (await loadPyodide()) as unknown as PyodideLike
}, 120_000)

function makeEngine(
  scripts: ReadonlyArray<{ name: string; script: string }>,
  seed = 42,
): { engine: MatchEngine; logs: LogEntry[]; runtime: PythonRuntime } {
  const logs: LogEntry[] = []
  const log = (entry: LogEntry) => logs.push(entry)
  const runtime = createPythonRuntime(pyodide, log)
  const engine = new MatchEngine(runtime, scripts, seed, 'open', log)
  return { engine, logs, runtime }
}

describe('MatchEngine with real Pyodide', () => {
  it('runs a bot that drives and fires', { timeout: 60_000 }, () => {
    const { engine } = makeEngine([
      { name: 'driver', script: DRIVER_BOT },
      { name: 'passenger', script: TALKER_BOT },
    ])
    const start = engine.snapshot().sim.tanks[0]
    engine.advance(60)
    const after = engine.snapshot().sim
    // Roughly one second of full-speed driving toward heading 0 (allowing turn-in time).
    expect(after.tanks[0].x).toBeGreaterThan(start.x + TANK_FORWARD_SPEED * 0.5)
    expect(after.nextShellId).toBeGreaterThanOrEqual(1)
    expect(engine.snapshot().botStatus[0].crashed).toBe(false)
  })

  it('a crashing bot goes inert while the match continues', { timeout: 60_000 }, () => {
    const { engine, logs } = makeEngine([
      { name: 'crasher', script: CRASHER_BOT },
      { name: 'driver', script: DRIVER_BOT },
    ])
    engine.advance(10)
    const snapshot = engine.snapshot()
    expect(snapshot.botStatus[0].crashed).toBe(true)
    expect(snapshot.botStatus[0].inert).toBe(true)
    expect(snapshot.botStatus[1].crashed).toBe(false)
    expect(snapshot.sim.tick).toBe(10)
    expect(logs.some((entry) => entry.botId === 0 && entry.text.includes('boom'))).toBe(true)
  })

  it('a script without a Bot subclass fails to load but the match still runs', { timeout: 60_000 }, () => {
    const { engine, logs } = makeEngine([
      { name: 'broken', script: 'x = 1' },
      { name: 'driver', script: DRIVER_BOT },
    ])
    expect(engine.snapshot().botStatus[0].crashed).toBe(true)
    expect(logs.some((entry) => entry.botId === 0 && entry.kind === 'err')).toBe(true)
    engine.advance(5)
    expect(engine.snapshot().sim.tick).toBe(5)
  })

  it('captures print output attributed to the right bot', { timeout: 60_000 }, () => {
    const { logs } = makeEngine([
      { name: 'alice', script: TALKER_BOT },
      { name: 'bob', script: TALKER_BOT },
    ])
    const hello = logs.filter((entry) => entry.kind === 'out' && entry.text.includes('hello from'))
    expect(hello.map((entry) => entry.botId).sort()).toEqual([0, 1])
    expect(hello.find((entry) => entry.botId === 0)?.text).toContain('alice')
  })

  it('two seekers find each other and land hits', { timeout: 120_000 }, () => {
    const { engine, logs } = makeEngine([
      { name: 'red', script: CENTER_SEEKER },
      { name: 'blue', script: CENTER_SEEKER },
    ])
    engine.advance(1800)
    const snapshot = engine.snapshot()
    const totalHp = snapshot.sim.tanks.reduce((sum, tank) => sum + tank.hp, 0)
    expect(totalHp).toBeLessThan(TANK_HP * 2)
    expect(logs.some((entry) => entry.kind === 'out' && entry.text.includes('OUCH'))).toBe(true)
    expect(snapshot.botStatus.every((status) => !status.crashed)).toBe(true)
  })

  it('all four sample bots run a battle without crashing', { timeout: 120_000 }, () => {
    const { engine } = makeEngine(
      SAMPLE_SCRIPTS.map((sample) => ({ name: sample.name, script: sample.source })),
      7,
    )
    engine.advance(900)
    const snapshot = engine.snapshot()
    expect(snapshot.botStatus.every((status) => !status.crashed && !status.inert)).toBe(true)
    if (snapshot.result === null) {
      expect(snapshot.sim.tick).toBe(900)
    }
  })
})
