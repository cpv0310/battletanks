"""BattleTanks bot API.

Player scripts subclass `Bot` and override event handlers. Commands set on
the bot during a handler are collected by the engine after the handler
returns. Movement commands are persistent intents: they stay in effect until
changed. `fire()` is one-shot.

Angles are in degrees (0 = right/+x, increasing clockwise on screen).
Distances are in pixels. Speeds and turn rates are fractions of the tank's
maximum, in [-1, 1].

Loadouts (8 points to spend, declared as a class attribute):

    class MyBot(Bot):
        loadout = ['armor', 'shield', 'gyro']   # 3 + 3 + 2 = 8 points

  Modules:
    'engine' (3)  +25% speed, -20 max HP
    'armor'  (3)  +40 max HP, -20% speed
    'gyro'   (2)  +50% turret rotation speed
    'radar'  (3)  self.ping(): next tick state.ping lists EVERY living tank
                  (ignores walls and sensor arc). 5s cooldown — and every
                  tank on the field hears it (their events.pinged gets your
                  position), so pinging reveals you.
    'shield' (3)  self.shield(): absorb the next 25 damage for up to 3s;
                  you cannot fire while it is up. 10s cooldown.
    'boost'  (2)  self.boost(): +80% speed for 2s, then -40% fatigue for 2s.
                  10s cooldown.
  State: state.me.modules / max_hp, plus state.me.shield / boost / radar
  (each None unless you own the module). An illegal loadout (unknown module,
  duplicates, or over 8 points) disables the bot with an error.

Teams:
  - state.me.team           Your team number, or None if playing solo.
  - state.team              None when solo; otherwise has:
      .id                   team number
      .mates                teammates: each has .id, .name, .alive
      .messages             messages from teammates (sent last tick): each has
                            .from_id, .from_name, .tick, and .data (whatever
                            the teammate sent)
  - self.send_team(data)    Send JSON-serializable data (dict/list/str/number)
                            to all living teammates; they receive it next tick.
  - Sensor detections include .x, .y (the detected tank's position) and
    .is_teammate — so a scout can send an enemy's location to the team:
        for t in state.sensor.tanks:
            if not t.is_teammate:
                self.send_team({'enemy_x': t.x, 'enemy_y': t.y})

Knowing when you are stuck (state.me):
  - state.me.stuck      True if the tank tried to move last tick but was
                        obstructed (wall, obstacle, or another tank).
  - state.me.at_wall    True while the hull is touching an arena wall.
  - state.me.wall_bearing
                        Bearing (degrees, relative to the hull heading) toward
                        the touched wall, or None when not at a wall. To drive
                        away from it:
                            self.turn_to(state.me.heading + state.me.wall_bearing + 180)
"""

import json as _json


def _clamp(value, low, high):
    return max(low, min(high, float(value)))


class Bot:
    """Base class for player bots. Override the on_* handlers."""

    #: Modules to equip (see the module list above). 8 points to spend.
    loadout = []

    def __init__(self):
        self._commands = {}
        #: Seeded random.Random instance — use this (not the random module)
        #: so matches stay reproducible.
        self.rng = None

    # ----- commands -------------------------------------------------------

    def drive(self, speed):
        """Set drive speed: -1 (full reverse) to 1 (full forward)."""
        self._commands['drive'] = _clamp(speed, -1.0, 1.0)

    def turn(self, rate):
        """Set hull turn rate: -1 (counter-clockwise) to 1 (clockwise)."""
        self._commands['turn'] = {'kind': 'rate', 'value': _clamp(rate, -1.0, 1.0)}

    def turn_to(self, heading_deg):
        """Steer the hull toward an absolute world heading and stop there."""
        self._commands['turn'] = {'kind': 'to', 'target': float(heading_deg)}

    def turn_turret(self, rate):
        """Set turret turn rate: -1 (counter-clockwise) to 1 (clockwise)."""
        self._commands['turret_turn'] = {'kind': 'rate', 'value': _clamp(rate, -1.0, 1.0)}

    def turn_turret_to(self, heading_deg):
        """Steer the turret toward an absolute world heading and stop there."""
        self._commands['turret_turn'] = {'kind': 'to', 'target': float(heading_deg)}

    def fire(self, power=2):
        """Fire the cannon if it is off cooldown (one-shot, not persistent).

        `power` is a wager from 1 to 3:
          - damage   = 10 * power
          - speed    = 700 - 50 * power px/s (heavy shells are dodgeable)
          - cooldown = 0.5 * power seconds
        DPS is flat across powers: light = fast harassment, heavy = burst
        that punishes anything slow or close. fire() defaults to power 2.
        """
        self._commands['fire'] = _clamp(power, 1.0, 3.0)

    def set_sensor(self, arc_deg):
        """Set the sensor arc (45..135 degrees); persists until changed.

        Narrowing buys extra reach: 45 deg sees ~590 px, 90 deg (default)
        350 px, 135 deg ~286 px. Narrow = sniper vision, wide = brawler
        awareness.
        """
        self._commands['sensor_arc'] = _clamp(arc_deg, 45.0, 135.0)

    def ping(self):
        """Radar ping (needs 'radar'): next tick, state.ping lists every
        living tank regardless of walls or sensor arc. Everyone hears it."""
        self._commands['ping'] = True

    def shield(self):
        """Raise the shield (needs 'shield'): absorbs 25 damage for up to
        3s; the cannon is locked while it is up."""
        self._commands['shield'] = True

    def boost(self):
        """Afterburner (needs 'boost'): +80% speed for 2s, then 2s of
        -40% fatigue."""
        self._commands['boost'] = True

    def send_team(self, data):
        """Send a message to all living teammates (delivered next tick).

        `data` must be JSON-serializable (numbers, strings, lists, dicts).
        Limited to 4 messages per tick; does nothing when playing solo.
        """
        try:
            _json.dumps(data)
        except (TypeError, ValueError):
            raise ValueError(
                'send_team data must be JSON-serializable (numbers, strings, lists, dicts)'
            )
        messages = self._commands.setdefault('team_messages', [])
        if len(messages) < 4:
            messages.append(data)

    # ----- event handlers (override these) --------------------------------

    def on_start(self, info):
        """Called once before the first tick."""

    def on_tick(self, state):
        """Called every tick with the current state. Required."""

    def on_hit(self, event):
        """Called when this tank takes shell damage."""

    def on_collision(self, event):
        """Called when this tank bumps a wall, obstacle, or tank."""

    def on_detected_tank(self, detection):
        """Called when a tank newly enters the sensor arc."""

    def on_destroyed(self):
        """Called when this tank is eliminated."""
