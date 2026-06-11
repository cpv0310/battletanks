import { beforeAll, describe, expect, it } from 'vitest'
import { loadPyodide } from 'pyodide'
import { TANK_FORWARD_SPEED, TANK_HP } from '../config'
import { blocksJsonToPython } from '../blocks/generator'
import { BRAWLER_BLOCKS_JSON, STARTER_BLOCKS_JSON } from '../blocks/sample'
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

const WALL_ESCAPER = `
from battletanks import Bot

class Escaper(Bot):
    def on_start(self, info):
        self.was_at_wall = False

    def on_tick(self, state):
        me = state.me
        if me.at_wall:
            if not self.was_at_wall:
                print("STUCK bearing", round(me.wall_bearing))
            self.was_at_wall = True
            self.turn_to(me.heading + me.wall_bearing + 180)
        elif self.was_at_wall:
            print("ESCAPED")
            self.was_at_wall = False
        self.drive(1.0)
`

let pyodide: PyodideLike

beforeAll(async () => {
  pyodide = (await loadPyodide()) as unknown as PyodideLike
}, 120_000)

function makeEngine(
  scripts: ReadonlyArray<{ name: string; script: string; team?: number | null }>,
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

  it('a bot can detect it is stuck on a wall and drive away', { timeout: 120_000 }, () => {
    const { engine, logs } = makeEngine([
      { name: 'escaper', script: WALL_ESCAPER },
      { name: 'bystander', script: TALKER_BOT },
    ])
    // Driving full speed in a straight line guarantees hitting a wall well
    // within this window; the bot must then report contact and break free.
    engine.advance(900)
    const output = logs.filter((entry) => entry.botId === 0 && entry.kind === 'out')
    expect(output.some((entry) => entry.text.includes('STUCK'))).toBe(true)
    expect(output.some((entry) => entry.text.includes('ESCAPED'))).toBe(true)
    expect(engine.snapshot().botStatus[0].crashed).toBe(false)
  })

  it('block-generated bots load and fight without crashing', { timeout: 120_000 }, () => {
    const { engine } = makeEngine([
      { name: 'brawler', script: blocksJsonToPython(BRAWLER_BLOCKS_JSON) },
      { name: 'starter', script: blocksJsonToPython(STARTER_BLOCKS_JSON) },
    ])
    engine.advance(900)
    const snapshot = engine.snapshot()
    expect(snapshot.botStatus.every((status) => !status.crashed && !status.inert)).toBe(true)
    // The brawler drives and spins its turret, so it must have moved.
    const brawler = snapshot.sim.tanks[0]
    expect(brawler.x !== 600 || brawler.y !== 500).toBe(true)
  })

  it('variable fire power and sensor focus work through the bridge', { timeout: 60_000 }, () => {
    const ABILITY_TESTER = `
from battletanks import Bot

class Tester(Bot):
    def on_tick(self, state):
        me = state.me
        if state.tick == 0:
            self.set_sensor(45)
            self.fire(3)
        elif state.tick == 1:
            print('cooldown', round(me.cooldown, 2))
        elif state.tick == 2:
            print('arc', round(me.sensor_arc), 'range', round(me.sensor_range))
`
    const { engine, logs } = makeEngine([
      { name: 'tester', script: ABILITY_TESTER },
      { name: 'other', script: TALKER_BOT },
    ])
    engine.advance(4)
    const output = logs.filter((entry) => entry.botId === 0 && entry.kind === 'out')
    // Heavy shot locks the cannon for 1.5s (power 3 x 0.5s).
    expect(output.some((entry) => entry.text === 'cooldown 1.5')).toBe(true)
    expect(output.some((entry) => entry.text === 'arc 45 range 495')).toBe(true)
    const shell = engine.snapshot().sim.shells[0] ?? null
    expect(shell === null || shell.power === 3).toBe(true)
    expect(engine.snapshot().botStatus[0].crashed).toBe(false)
  })

  it('royal rumble: 8 solo bots fight without crashing', { timeout: 240_000 }, () => {
    const lineup = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
      name: `rumble-${i}`,
      script: SAMPLE_SCRIPTS[i % SAMPLE_SCRIPTS.length].source,
    }))
    const { engine } = makeEngine(lineup, 99)
    engine.advance(3600) // one minute of battle
    const snapshot = engine.snapshot()
    expect(snapshot.botStatus.every((status) => !status.crashed)).toBe(true)
    // A free-for-all this dense must produce real combat.
    const totalHp = snapshot.sim.tanks.reduce((sum, tank) => sum + tank.hp, 0)
    expect(totalHp).toBeLessThan(800)
    if (snapshot.result) {
      expect(snapshot.result.winners.length).toBeLessThanOrEqual(1)
    }
  })

  it('all sample bots run a battle without crashing', { timeout: 120_000 }, () => {
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

const TEAM_REPORTER = `
import math
from battletanks import Bot

class Reporter(Bot):
    def on_start(self, info):
        self.cx = info.arena.width / 2
        self.cy = info.arena.height / 2

    def on_tick(self, state):
        me = state.me
        enemies = [t for t in state.sensor.tanks if not t.is_teammate]
        if enemies:
            self.send_team({'x': enemies[0].x, 'y': enemies[0].y})
            self.drive(0.0)
            return
        if math.hypot(self.cx - me.x, self.cy - me.y) > 150:
            self.turn_to(math.degrees(math.atan2(self.cy - me.y, self.cx - me.x)))
            self.drive(1.0)
        else:
            self.drive(0.0)
            self.turn_turret(1.0)
`

const TEAM_RECEIVER = `
import math
from battletanks import Bot

class Receiver(Bot):
    def on_start(self, info):
        self.goal = None
        self.reported = False

    def on_tick(self, state):
        for msg in state.team.messages:
            self.goal = (msg.data.x, msg.data.y)
            if not self.reported:
                print('GOT', msg.from_name, round(msg.data.x), round(msg.data.y))
                self.reported = True
        if self.goal is None:
            self.drive(0.0)
            return
        me = state.me
        dx = self.goal[0] - me.x
        dy = self.goal[1] - me.y
        if math.hypot(dx, dy) > 100:
            self.turn_to(math.degrees(math.atan2(dy, dx)))
            self.drive(1.0)
        else:
            print('ARRIVED')
            self.drive(0.0)
`

const CENTER_PACIFIST = `
import math
from battletanks import Bot

class Pacifist(Bot):
    def on_start(self, info):
        self.cx = info.arena.width / 2
        self.cy = info.arena.height / 2

    def on_tick(self, state):
        me = state.me
        if math.hypot(self.cx - me.x, self.cy - me.y) > 150:
            self.turn_to(math.degrees(math.atan2(self.cy - me.y, self.cx - me.x)))
            self.drive(1.0)
        else:
            self.drive(0.0)
`

describe('team channel with real Pyodide', () => {
  it('relays an enemy sighting and the teammate converges on it', { timeout: 120_000 }, () => {
    const { engine, logs } = makeEngine([
      { name: 'scout', script: TEAM_REPORTER, team: 1 },
      { name: 'striker', script: TEAM_RECEIVER, team: 1 },
      { name: 'prey', script: CENTER_PACIFIST, team: null },
    ])
    const start = engine.snapshot().sim.tanks[1]
    engine.advance(1800)
    const output = logs.filter((entry) => entry.botId === 1 && entry.kind === 'out')
    // The receiver heard a report from its named teammate...
    expect(output.some((entry) => entry.text.startsWith('GOT scout'))).toBe(true)
    // ...and drove to the reported location.
    expect(output.some((entry) => entry.text.includes('ARRIVED'))).toBe(true)
    const receiver = engine.snapshot().sim.tanks[1]
    expect(receiver.x !== start.x || receiver.y !== start.y).toBe(true)
    expect(engine.snapshot().botStatus.every((status) => !status.crashed)).toBe(true)
  })

  it('solo tanks have no team state and send_team is a no-op', { timeout: 60_000 }, () => {
    const SOLO_CHECK = `
from battletanks import Bot

class Solo(Bot):
    def on_tick(self, state):
        if state.tick == 1:
            print('team is', state.team)
        self.send_team({'x': 1})
`
    const { engine, logs } = makeEngine([
      { name: 'solo', script: SOLO_CHECK },
      { name: 'other', script: SOLO_CHECK },
    ])
    engine.advance(5)
    expect(logs.some((entry) => entry.text === 'team is None')).toBe(true)
    expect(engine.snapshot().botStatus.every((status) => !status.crashed)).toBe(true)
  })

  it('team battle: 2v2 team hunters fight to a team result', { timeout: 240_000 }, () => {
    const teamHunter = SAMPLE_SCRIPTS.find((sample) => sample.name === 'Team Hunter')
    if (!teamHunter) throw new Error('Team Hunter sample missing')
    const { engine } = makeEngine(
      [
        { name: 'red-1', script: teamHunter.source, team: 1 },
        { name: 'red-2', script: teamHunter.source, team: 1 },
        { name: 'blue-1', script: teamHunter.source, team: 2 },
        { name: 'blue-2', script: teamHunter.source, team: 2 },
      ],
      31,
    )
    engine.advance(10_800)
    const snapshot = engine.snapshot()
    expect(snapshot.botStatus.every((status) => !status.crashed)).toBe(true)
    expect(snapshot.result).not.toBeNull()
    // Winners (if any) must all come from a single team.
    const winnerTeams = new Set(
      (snapshot.result?.winners ?? []).map((id) => snapshot.sim.tanks[id].team),
    )
    expect(winnerTeams.size).toBeLessThanOrEqual(1)
  })

  it('a team win ends the match for the whole team', { timeout: 120_000 }, () => {
    const KILLER = `
import math
from battletanks import Bot

class Killer(Bot):
    def on_start(self, info):
        self.cx = info.arena.width / 2
        self.cy = info.arena.height / 2

    def on_tick(self, state):
        me = state.me
        enemies = [t for t in state.sensor.tanks if not t.is_teammate]
        if enemies:
            t = enemies[0]
            aim = me.turret_heading + t.bearing
            self.turn_turret_to(aim)
            self.turn_to(aim)
            self.drive(1.0 if t.distance > 120 else 0.0)
            if abs(t.bearing) < 5 and me.cooldown == 0:
                self.fire()
            return
        if math.hypot(self.cx - me.x, self.cy - me.y) > 100:
            self.turn_to(math.degrees(math.atan2(self.cy - me.y, self.cx - me.x)))
            self.drive(1.0)
        self.turn_turret(1.0)
`
    const { engine } = makeEngine([
      { name: 'k1', script: KILLER, team: 1 },
      { name: 'k2', script: KILLER, team: 1 },
      { name: 'prey', script: CENTER_PACIFIST, team: null },
    ])
    engine.advance(10_800)
    const result = engine.snapshot().result
    expect(result).not.toBeNull()
    if (result?.reason === 'last-standing') {
      expect(result.winners).toEqual([0, 1])
    }
  })
})
