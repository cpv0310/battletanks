import * as Blockly from 'blockly/core'
import { Order, pythonGenerator } from 'blockly/python'
import { defineTankBlocks } from './definitions'

const INDENT = '  '

type StatementGen = (block: Blockly.Block, generator: typeof pythonGenerator) => string
type ValueGen = (block: Blockly.Block, generator: typeof pythonGenerator) => [string, number]

let registered = false

/** Register python generators for the tank blocks. Idempotent. */
export function registerTankGenerators(): void {
  if (registered) return
  registered = true
  defineTankBlocks()
  pythonGenerator.INDENT = INDENT

  const statements: Record<string, StatementGen> = {
    action_drive: (block) => {
      const sign = block.getFieldValue('DIR') === 'BACKWARD' ? -1 : 1
      return `self.drive(${(sign * numberField(block, 'SPEED')) / 100})\n`
    },
    action_stop: () => 'self.drive(0)\n',
    action_turn: (block) => {
      const sign = block.getFieldValue('DIR') === 'LEFT' ? -1 : 1
      return `self.turn(${(sign * numberField(block, 'SPEED')) / 100})\n`
    },
    action_turn_random: () => 'self.turn_to(self.rng.uniform(0, 360))\n',
    action_away_wall: () =>
      'if me.at_wall:\n' + INDENT + 'self.turn_to(me.heading + me.wall_bearing + 180)\n',
    action_turret_spin: (block) => {
      const sign = block.getFieldValue('DIR') === 'LEFT' ? -1 : 1
      return `self.turn_turret(${(sign * numberField(block, 'SPEED')) / 100})\n`
    },
    action_aim_target: () =>
      'if target is not None:\n' +
      INDENT +
      'self.turn_turret_to(me.turret_heading + target.bearing)\n',
    action_chase: () =>
      'if target is not None:\n' +
      INDENT +
      'self.turn_to(me.turret_heading + target.bearing)\n' +
      INDENT +
      'self.drive(1.0)\n',
    action_fire: (block) => {
      const power = Number(block.getFieldValue('POWER')) || 2
      return 'if me.cooldown == 0:\n' + INDENT + `self.fire(${power})\n`
    },
    action_sensor: (block) => {
      const arc = Number(block.getFieldValue('MODE')) || 90
      return `self.set_sensor(${arc})\n`
    },
    action_shield: () => 'self.shield()\n',
    action_ping: () => 'self.ping()\n',
    action_boost: () => 'self.boost()\n',
    action_say: (block) => `print(${JSON.stringify(String(block.getFieldValue('TEXT')))})\n`,
    control_if: (block, generator) => {
      const cond = generator.valueToCode(block, 'COND', Order.NONE) || 'False'
      const body = generator.statementToCode(block, 'DO') || INDENT + 'pass\n'
      return `if ${cond}:\n${body}`
    },
    control_ifelse: (block, generator) => {
      const cond = generator.valueToCode(block, 'COND', Order.NONE) || 'False'
      const body = generator.statementToCode(block, 'DO') || INDENT + 'pass\n'
      const orelse = generator.statementToCode(block, 'ELSE') || INDENT + 'pass\n'
      return `if ${cond}:\n${body}else:\n${orelse}`
    },
  }

  const values: Record<string, ValueGen> = {
    cond_enemy_near: (block) => [
      `(target is not None and target.distance < ${numberField(block, 'DIST')})`,
      Order.ATOMIC,
    ],
    cond_aimed: (block) => [
      `(target is not None and abs(target.bearing) < ${numberField(block, 'DEG')})`,
      Order.ATOMIC,
    ],
    cond_ready: () => ['(me.cooldown == 0)', Order.ATOMIC],
    cond_hp_below: (block) => [`(me.hp < ${numberField(block, 'HP')})`, Order.ATOMIC],
    cond_chance: (block) => [
      `(self.rng.random() < ${numberField(block, 'PCT') / 100})`,
      Order.ATOMIC,
    ],
  }

  for (const [type, gen] of Object.entries(statements)) pythonGenerator.forBlock[type] = gen
  for (const [type, gen] of Object.entries(values)) pythonGenerator.forBlock[type] = gen
}

function numberField(block: Blockly.Block, name: string): number {
  const value = Number(block.getFieldValue(name))
  return Number.isFinite(value) ? value : 0
}

interface EventSection {
  readonly type: string
  readonly header: string | null
}

/** Assembly order for event sections inside on_tick. */
const SECTIONS: ReadonlyArray<EventSection> = [
  { type: 'event_tick', header: null },
  { type: 'event_see_tank', header: 'if target is not None:' },
  { type: 'event_hit', header: 'if state.events.hit_by_shell:' },
  { type: 'event_wall', header: 'if me.at_wall:' },
  { type: 'event_stuck', header: 'if me.stuck:' },
]

/**
 * Compile a block workspace into a complete BattleTanks Python bot.
 * Event blocks become guarded sections of on_tick; loose statement chains
 * are treated as every-tick logic.
 */
export function workspaceToPython(workspace: Blockly.Workspace): string {
  registerTankGenerators()
  pythonGenerator.init(workspace)

  const bodies = new Map<string, string[]>()
  const appendBody = (type: string, code: string) => {
    if (code.length === 0) return
    const list = bodies.get(type) ?? []
    list.push(code)
    bodies.set(type, list)
  }

  for (const block of workspace.getTopBlocks(true)) {
    if (SECTIONS.some((section) => section.type === block.type)) {
      appendBody(block.type, pythonGenerator.statementToCode(block, 'DO'))
    } else if (block.previousConnection) {
      // A loose statement chain dropped on the canvas: run it every tick.
      const code = pythonGenerator.blockToCode(block)
      if (typeof code === 'string') appendBody('event_tick', reindent(code, 1))
    }
  }

  // Ability blocks auto-equip their module so block programs just work.
  const ABILITY_MODULES: Record<string, string> = {
    action_shield: 'shield',
    action_ping: 'radar',
    action_boost: 'boost',
  }
  const modules = [
    ...new Set(
      workspace
        .getAllBlocks(false)
        .map((block) => ABILITY_MODULES[block.type])
        .filter((module): module is string => module !== undefined),
    ),
  ]

  const lines: string[] = [
    'from battletanks import Bot',
    '',
    '',
    'class BlockBot(Bot):',
    ...(modules.length > 0
      ? [`${INDENT}loadout = [${modules.map((m) => `'${m}'`).join(', ')}]`, '']
      : []),
    `${INDENT}def on_tick(self, state):`,
    `${INDENT.repeat(2)}me = state.me`,
    `${INDENT.repeat(2)}target = state.sensor.tanks[0] if state.sensor.tanks else None`,
  ]
  for (const section of SECTIONS) {
    const parts = bodies.get(section.type)
    if (!parts || parts.length === 0) continue
    const body = parts.join('')
    if (section.header === null) {
      lines.push(trimEnd(reindent(body, 1)))
    } else {
      lines.push(`${INDENT.repeat(2)}${section.header}`)
      lines.push(trimEnd(reindent(body, 2)))
    }
  }
  return lines.join('\n') + '\n'
}

/** Compile serialized workspace JSON to Python using a headless workspace. */
export function blocksJsonToPython(json: string): string {
  registerTankGenerators()
  const workspace = new Blockly.Workspace()
  try {
    Blockly.serialization.workspaces.load(JSON.parse(json), workspace)
    return workspaceToPython(workspace)
  } finally {
    workspace.dispose()
  }
}

/**
 * Add `levels` of indentation to every non-empty line, preserving the
 * code's own relative nesting (statementToCode output is one level deep).
 */
function reindent(code: string, levels: number): string {
  const prefix = INDENT.repeat(levels)
  return code
    .split('\n')
    .map((line) => (line.trim().length > 0 ? prefix + line : line))
    .join('\n')
}

function trimEnd(code: string): string {
  return code.replace(/\s+$/, '')
}
