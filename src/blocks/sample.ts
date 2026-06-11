/** Serialized Blockly workspaces (Blockly JSON serialization format). */

/** Starter layout for a brand-new blocks program. */
export const STARTER_BLOCKS_JSON = JSON.stringify({
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'event_tick',
        x: 24,
        y: 24,
        inputs: {
          DO: {
            block: {
              type: 'action_turret_spin',
              fields: { DIR: 'RIGHT', SPEED: 100 },
            },
          },
        },
      },
      {
        type: 'event_see_tank',
        x: 24,
        y: 170,
        inputs: {
          DO: {
            block: {
              type: 'action_aim_target',
              next: {
                block: {
                  type: 'control_if',
                  inputs: {
                    COND: { block: { type: 'cond_aimed', fields: { DEG: 5 } } },
                    DO: { block: { type: 'action_fire' } },
                  },
                },
              },
            },
          },
        },
      },
    ],
  },
})

/** "Block Brawler" — the built-in sample blocks bot. */
export const BRAWLER_BLOCKS_JSON = JSON.stringify({
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'event_tick',
        x: 24,
        y: 24,
        inputs: {
          DO: {
            block: {
              type: 'action_turret_spin',
              fields: { DIR: 'RIGHT', SPEED: 80 },
              next: {
                block: {
                  type: 'action_drive',
                  fields: { DIR: 'FORWARD', SPEED: 60 },
                },
              },
            },
          },
        },
      },
      {
        type: 'event_see_tank',
        x: 24,
        y: 210,
        inputs: {
          DO: {
            block: {
              type: 'action_aim_target',
              next: {
                block: {
                  type: 'control_ifelse',
                  inputs: {
                    COND: { block: { type: 'cond_enemy_near', fields: { DIST: 320 } } },
                    DO: { block: { type: 'action_stop' } },
                    ELSE: { block: { type: 'action_chase' } },
                  },
                  next: {
                    block: {
                      type: 'control_if',
                      inputs: {
                        COND: { block: { type: 'cond_aimed', fields: { DEG: 6 } } },
                        DO: { block: { type: 'action_fire' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        type: 'event_wall',
        x: 430,
        y: 300,
        inputs: {
          DO: {
            block: {
              type: 'action_away_wall',
              next: {
                block: { type: 'action_drive', fields: { DIR: 'FORWARD', SPEED: 100 } },
              },
            },
          },
        },
      },
      {
        type: 'event_hit',
        x: 430,
        y: 24,
        inputs: {
          DO: {
            block: {
              type: 'control_if',
              inputs: {
                COND: { block: { type: 'cond_hp_below', fields: { HP: 40 } } },
                DO: {
                  block: {
                    type: 'action_turn_random',
                    next: {
                      block: {
                        type: 'action_drive',
                        fields: { DIR: 'FORWARD', SPEED: 100 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ],
  },
})
