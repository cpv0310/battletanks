"""BattleTanks bot API.

Player scripts subclass `Bot` and override event handlers. Commands set on
the bot during a handler are collected by the engine after the handler
returns. Movement commands are persistent intents: they stay in effect until
changed. `fire()` is one-shot.

Angles are in degrees (0 = right/+x, increasing clockwise on screen).
Distances are in pixels. Speeds and turn rates are fractions of the tank's
maximum, in [-1, 1].

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


def _clamp(value, low, high):
    return max(low, min(high, float(value)))


class Bot:
    """Base class for player bots. Override the on_* handlers."""

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

    def fire(self):
        """Fire the cannon if it is off cooldown (one-shot, not persistent)."""
        self._commands['fire'] = True

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
