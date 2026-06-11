import { describe, expect, it } from 'vitest'
import * as Blockly from 'blockly/core'
import { blocksJsonToPython } from './generator'
import { BRAWLER_BLOCKS_JSON, STARTER_BLOCKS_JSON } from './sample'

function chain(...blocks: object[]): object {
  return blocks.reduceRight((next, block) => ({ ...block, ...(Object.keys(next).length ? { next: { block: next } } : {}) }))
}

function workspaceJson(...topBlocks: object[]): string {
  return JSON.stringify({ blocks: { languageVersion: 0, blocks: topBlocks } })
}

describe('blocksJsonToPython', () => {
  it('compiles the starter program into a valid bot class', () => {
    const code = blocksJsonToPython(STARTER_BLOCKS_JSON)
    expect(code).toContain('from battletanks import Bot')
    expect(code).toContain('class BlockBot(Bot):')
    expect(code).toContain('def on_tick(self, state):')
    expect(code).toContain('self.turn_turret(1)')
    expect(code).toContain('if target is not None:')
  })

  it('compiles the Block Brawler sample with all event sections', () => {
    const code = blocksJsonToPython(BRAWLER_BLOCKS_JSON)
    expect(code).toContain('if target is not None:')
    expect(code).toContain('if state.events.hit_by_shell:')
    expect(code).toContain('if me.at_wall:')
    expect(code).toContain('self.turn_to(me.heading + me.wall_bearing + 180)')
    expect(code).toContain('else:')
  })

  it('maps action fields to API calls with scaled values', () => {
    const code = blocksJsonToPython(
      workspaceJson({
        type: 'event_tick',
        inputs: {
          DO: {
            block: chain(
              { type: 'action_drive', fields: { DIR: 'BACKWARD', SPEED: 50 } },
              { type: 'action_turn', fields: { DIR: 'LEFT', SPEED: 25 } },
              { type: 'action_say', fields: { TEXT: 'hi "there"' } },
            ),
          },
        },
      }),
    )
    expect(code).toContain('self.drive(-0.5)')
    expect(code).toContain('self.turn(-0.25)')
    expect(code).toContain('print("hi \\"there\\"")')
  })

  it('maps fire power and sensor mode dropdowns', () => {
    const code = blocksJsonToPython(
      workspaceJson({
        type: 'event_tick',
        inputs: {
          DO: {
            block: chain(
              { type: 'action_sensor', fields: { MODE: '45' } },
              { type: 'action_fire', fields: { POWER: '3' } },
            ),
          },
        },
      }),
    )
    expect(code).toContain('self.set_sensor(45)')
    expect(code).toContain('self.fire(3)')
  })

  it('treats loose statement chains as every-tick logic', () => {
    const code = blocksJsonToPython(
      workspaceJson({ type: 'action_drive', fields: { DIR: 'FORWARD', SPEED: 100 } }),
    )
    expect(code).toContain('self.drive(1)')
  })

  it('guards fire with the cooldown and conditions with target presence', () => {
    const code = blocksJsonToPython(
      workspaceJson({
        type: 'event_see_tank',
        inputs: {
          DO: {
            block: {
              type: 'control_if',
              inputs: {
                COND: { block: { type: 'cond_enemy_near', fields: { DIST: 150 } } },
                DO: { block: { type: 'action_fire' } },
              },
            },
          },
        },
      }),
    )
    expect(code).toContain('if (target is not None and target.distance < 150):')
    expect(code).toContain('if me.cooldown == 0:')
    expect(code).toContain('self.fire(2)')
  })

  it('produces consistent indentation (no tabs, two-space steps)', () => {
    const code = blocksJsonToPython(BRAWLER_BLOCKS_JSON)
    expect(code).not.toContain('\t')
    for (const line of code.split('\n')) {
      const leading = line.length - line.trimStart().length
      expect(leading % 2).toBe(0)
    }
  })

  it('an empty workspace still produces a loadable bot', () => {
    const code = blocksJsonToPython(workspaceJson())
    expect(code).toContain('class BlockBot(Bot):')
    expect(code).toContain('def on_tick(self, state):')
  })

  it('round-trips through Blockly serialization', () => {
    const workspace = new Blockly.Workspace()
    try {
      Blockly.serialization.workspaces.load(JSON.parse(BRAWLER_BLOCKS_JSON), workspace)
      const saved = JSON.stringify(Blockly.serialization.workspaces.save(workspace))
      expect(blocksJsonToPython(saved)).toBe(blocksJsonToPython(BRAWLER_BLOCKS_JSON))
    } finally {
      workspace.dispose()
    }
  })
})
