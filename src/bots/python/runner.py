"""Engine-side bot runner. Not visible to player scripts."""

import json
import random
import sys
import types

_bots = {}
_prev_detected = {}


def install_battletanks(source):
    """Install the battletanks module so player scripts can import it."""
    module = types.ModuleType('battletanks')
    module.__doc__ = 'BattleTanks bot API'
    exec(compile(source, 'battletanks.py', 'exec'), module.__dict__)
    sys.modules['battletanks'] = module


class _View:
    """Read-only attribute access over a dict (state objects for bots)."""

    __slots__ = ('_data',)

    def __init__(self, data):
        object.__setattr__(self, '_data', data)

    def __getattr__(self, name):
        try:
            return _wrap(self._data[name])
        except KeyError:
            raise AttributeError(name) from None

    def __setattr__(self, name, value):
        raise AttributeError('state is read-only')

    def __repr__(self):
        return repr(self._data)


def _wrap(value):
    if isinstance(value, dict):
        return _View(value)
    if isinstance(value, list):
        return [_wrap(item) for item in value]
    return value


def load_bot(bot_id, source, seed, info_json):
    """Compile a player script, find its Bot subclass, and start it."""
    import battletanks

    bot_id = int(bot_id)
    namespace = {'__name__': 'bot_%d' % bot_id}
    exec(compile(source, '<bot %d>' % bot_id, 'exec'), namespace)

    bot_class = None
    for value in namespace.values():
        if (
            isinstance(value, type)
            and issubclass(value, battletanks.Bot)
            and value is not battletanks.Bot
        ):
            bot_class = value
    if bot_class is None:
        raise ValueError('Script must define a class that subclasses battletanks.Bot')

    bot = bot_class()
    bot.rng = random.Random(seed)
    _bots[bot_id] = bot
    _prev_detected[bot_id] = set()
    bot.on_start(_wrap(json.loads(info_json)))

    loadout = getattr(bot, 'loadout', []) or []
    if not isinstance(loadout, (list, tuple)):
        raise ValueError('loadout must be a list of module names')
    return json.dumps([str(module) for module in loadout])


def tick_bot(bot_id, state_json):
    """Run one tick for a bot; returns its buffered commands as JSON."""
    bot_id = int(bot_id)
    bot = _bots[bot_id]
    raw = json.loads(state_json)
    bot._commands = {}

    for event in raw['events']['hit_by_shell']:
        bot.on_hit(_wrap(event))
    for event in raw['events']['collisions']:
        bot.on_collision(_wrap(event))

    detected_now = set()
    previous = _prev_detected.get(bot_id, set())
    for detection in raw['sensor']['tanks']:
        detected_now.add(detection['id'])
        if detection['id'] not in previous:
            bot.on_detected_tank(_wrap(detection))
    _prev_detected[bot_id] = detected_now

    bot.on_tick(_wrap(raw))
    return json.dumps(bot._commands)


def destroy_bot(bot_id):
    """Notify a bot that its tank was eliminated."""
    bot = _bots.get(int(bot_id))
    if bot is not None:
        bot.on_destroyed()
