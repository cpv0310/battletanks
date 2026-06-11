import * as Blockly from 'blockly/core'

const EVENT_COLOUR = 120
const ACTION_COLOUR = 210
const LOGIC_COLOUR = 30

const DIRECTION_LR = [
  ['left', 'LEFT'],
  ['right', 'RIGHT'],
]

/** Custom BattleTanks blocks. Call once before using the toolbox or generator. */
export function defineTankBlocks(): void {
  if (Blockly.Blocks['event_tick']) return // already defined
  Blockly.defineBlocksWithJsonArray([
    // ----- events (top-level containers) --------------------------------
    {
      type: 'event_tick',
      message0: 'every tick %1 %2',
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: EVENT_COLOUR,
      tooltip: 'Runs every game tick (60 times per second).',
    },
    {
      type: 'event_see_tank',
      message0: 'when I see an enemy %1 %2',
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: EVENT_COLOUR,
      tooltip: 'Runs while an enemy tank is inside my sensor arc.',
    },
    {
      type: 'event_hit',
      message0: 'when I get hit %1 %2',
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: EVENT_COLOUR,
      tooltip: 'Runs on a tick where a shell hit me.',
    },
    {
      type: 'event_wall',
      message0: 'when I touch a wall %1 %2',
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: EVENT_COLOUR,
      tooltip: 'Runs while my hull is touching the arena wall.',
    },
    {
      type: 'event_stuck',
      message0: 'when I am stuck %1 %2',
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: EVENT_COLOUR,
      tooltip: 'Runs while my movement is blocked by an obstacle or tank.',
    },
    // ----- actions -------------------------------------------------------
    {
      type: 'action_drive',
      message0: 'drive %1 at %2 %% speed',
      args0: [
        {
          type: 'field_dropdown',
          name: 'DIR',
          options: [
            ['forward', 'FORWARD'],
            ['backward', 'BACKWARD'],
          ],
        },
        { type: 'field_number', name: 'SPEED', value: 100, min: 0, max: 100 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: ACTION_COLOUR,
      tooltip: 'Keep driving until changed.',
    },
    {
      type: 'action_stop',
      message0: 'stop driving',
      previousStatement: null,
      nextStatement: null,
      colour: ACTION_COLOUR,
    },
    {
      type: 'action_turn',
      message0: 'turn %1 at %2 %% speed',
      args0: [
        { type: 'field_dropdown', name: 'DIR', options: DIRECTION_LR },
        { type: 'field_number', name: 'SPEED', value: 100, min: 0, max: 100 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: ACTION_COLOUR,
      tooltip: 'Keep turning the hull until changed.',
    },
    {
      type: 'action_turn_random',
      message0: 'turn to a random direction',
      previousStatement: null,
      nextStatement: null,
      colour: ACTION_COLOUR,
    },
    {
      type: 'action_away_wall',
      message0: 'turn away from the wall',
      previousStatement: null,
      nextStatement: null,
      colour: ACTION_COLOUR,
      tooltip: 'Point the hull away from the wall I am touching.',
    },
    {
      type: 'action_turret_spin',
      message0: 'spin turret %1 at %2 %% speed',
      args0: [
        { type: 'field_dropdown', name: 'DIR', options: DIRECTION_LR },
        { type: 'field_number', name: 'SPEED', value: 100, min: 0, max: 100 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: ACTION_COLOUR,
      tooltip: 'Keep spinning the turret (and sensor) until changed.',
    },
    {
      type: 'action_aim_target',
      message0: 'aim turret at the enemy',
      previousStatement: null,
      nextStatement: null,
      colour: ACTION_COLOUR,
      tooltip: 'Track the nearest enemy I can see with the turret.',
    },
    {
      type: 'action_chase',
      message0: 'drive toward the enemy',
      previousStatement: null,
      nextStatement: null,
      colour: ACTION_COLOUR,
      tooltip: 'Turn the hull toward the nearest visible enemy and drive.',
    },
    {
      type: 'action_fire',
      message0: 'fire %1 shell!',
      args0: [
        {
          type: 'field_dropdown',
          name: 'POWER',
          options: [
            ['a standard', '2'],
            ['a light (fast)', '1'],
            ['a heavy (slow)', '3'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 0,
      tooltip:
        'Fire if the cannon is ready. Light: 10 damage, fast, quick reload. Heavy: 30 damage, slow shell, long reload.',
    },
    {
      type: 'action_sensor',
      message0: 'set sensor to %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'MODE',
          options: [
            ['standard (90°)', '90'],
            ['narrow — sees far (45°)', '45'],
            ['laser — sees very far (30°)', '30'],
            ['wide — sees close (135°)', '135'],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: ACTION_COLOUR,
      tooltip: 'Trade sensor width for range. Stays until changed.',
    },
    {
      type: 'action_shield',
      message0: 'raise my shield',
      previousStatement: null,
      nextStatement: null,
      colour: ACTION_COLOUR,
      tooltip:
        'Absorb the next 25 damage for 3s (cannot fire while up; 10s cooldown). Using this block equips the shield module (3 loadout points).',
    },
    {
      type: 'action_ping',
      message0: 'radar ping',
      previousStatement: null,
      nextStatement: null,
      colour: ACTION_COLOUR,
      tooltip:
        'See every tank on the field for one tick — but everyone hears your ping. Equips the radar module (3 loadout points). 5s cooldown.',
    },
    {
      type: 'action_boost',
      message0: 'afterburner!',
      previousStatement: null,
      nextStatement: null,
      colour: ACTION_COLOUR,
      tooltip:
        '+80% speed for 2s, then 2s of fatigue. Equips the afterburner module (2 loadout points). 10s cooldown.',
    },
    {
      type: 'action_say',
      message0: 'say %1',
      args0: [{ type: 'field_input', name: 'TEXT', text: 'hello' }],
      previousStatement: null,
      nextStatement: null,
      colour: ACTION_COLOUR,
      tooltip: 'Print a message to the bot console.',
    },
    // ----- logic ----------------------------------------------------------
    {
      type: 'control_if',
      message0: 'if %1 then %2 %3',
      args0: [
        { type: 'input_value', name: 'COND', check: 'Boolean' },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: LOGIC_COLOUR,
    },
    {
      type: 'control_ifelse',
      message0: 'if %1 then %2 %3 otherwise %4 %5',
      args0: [
        { type: 'input_value', name: 'COND', check: 'Boolean' },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'ELSE' },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: LOGIC_COLOUR,
    },
    {
      type: 'cond_enemy_near',
      message0: 'enemy is closer than %1 px',
      args0: [{ type: 'field_number', name: 'DIST', value: 200, min: 1, max: 2000 }],
      output: 'Boolean',
      colour: LOGIC_COLOUR,
    },
    {
      type: 'cond_aimed',
      message0: 'turret is aimed at the enemy (± %1 °)',
      args0: [{ type: 'field_number', name: 'DEG', value: 5, min: 1, max: 90 }],
      output: 'Boolean',
      colour: LOGIC_COLOUR,
    },
    {
      type: 'cond_ready',
      message0: 'cannon is ready',
      output: 'Boolean',
      colour: LOGIC_COLOUR,
    },
    {
      type: 'cond_hp_below',
      message0: 'my HP is below %1',
      args0: [{ type: 'field_number', name: 'HP', value: 40, min: 1, max: 100 }],
      output: 'Boolean',
      colour: LOGIC_COLOUR,
    },
    {
      type: 'cond_chance',
      message0: '%1 %% chance',
      args0: [{ type: 'field_number', name: 'PCT', value: 50, min: 1, max: 100 }],
      output: 'Boolean',
      colour: LOGIC_COLOUR,
      tooltip: 'Randomly true this percentage of the time.',
    },
  ])
}

export const TANK_TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Events',
      colour: String(EVENT_COLOUR),
      contents: [
        { kind: 'block', type: 'event_tick' },
        { kind: 'block', type: 'event_see_tank' },
        { kind: 'block', type: 'event_hit' },
        { kind: 'block', type: 'event_wall' },
        { kind: 'block', type: 'event_stuck' },
      ],
    },
    {
      kind: 'category',
      name: 'Actions',
      colour: String(ACTION_COLOUR),
      contents: [
        { kind: 'block', type: 'action_drive' },
        { kind: 'block', type: 'action_stop' },
        { kind: 'block', type: 'action_turn' },
        { kind: 'block', type: 'action_turn_random' },
        { kind: 'block', type: 'action_away_wall' },
        { kind: 'block', type: 'action_turret_spin' },
        { kind: 'block', type: 'action_aim_target' },
        { kind: 'block', type: 'action_chase' },
        { kind: 'block', type: 'action_fire' },
        { kind: 'block', type: 'action_sensor' },
        { kind: 'block', type: 'action_shield' },
        { kind: 'block', type: 'action_ping' },
        { kind: 'block', type: 'action_boost' },
        { kind: 'block', type: 'action_say' },
      ],
    },
    {
      kind: 'category',
      name: 'Logic',
      colour: String(LOGIC_COLOUR),
      contents: [
        { kind: 'block', type: 'control_if' },
        { kind: 'block', type: 'control_ifelse' },
        { kind: 'block', type: 'cond_enemy_near' },
        { kind: 'block', type: 'cond_aimed' },
        { kind: 'block', type: 'cond_ready' },
        { kind: 'block', type: 'cond_hp_below' },
        { kind: 'block', type: 'cond_chance' },
      ],
    },
  ],
}
