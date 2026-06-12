# BattleTanks

A browser-based programming game. You don't drive the tanks — you **program** them, in Python or with drag-and-drop blocks, then watch your bot fight up to seven others in a 1200×1000 arena. Last tank (or team) standing wins.

**▶ Play online:** https://cpv0310.github.io/battletanks/

## Features

- **Program in Python or blocks.** Every script has a Code ⇄ Blocks toggle: write a real Python `Bot` class, or snap together Scratch-style blocks (events, actions, logic) that compile to Python behind the scenes. Scripts save to an in-browser library; six sample bots are included to learn from (Hunter, Team Hunter, Juggernaut, Spinner, Wanderer, Sniper).
- **Deterministic simulation.** A pure 60-tick/s engine — same scripts + same seed replay the identical battle. Python runs sandboxed in a Web Worker via Pyodide with a per-tick CPU budget; a crashed or runaway bot goes inert instead of breaking the match.
- **Hull + turret tank model.** The turret rotates independently and carries the cannon and sensor. Tanks know when they're `stuck` or `at_wall` and can steer away.
- **Variable fire power.** `fire(1..3)` is a wager: damage `10×p`, shell speed `700−50×p`, cooldown `0.5×p`s — flat DPS, so light shells harass and heavy shells punish, and heavy shells are slow enough to dodge at range.
- **Adjustable sensor.** A line-of-sight vision cone on the turret, `set_sensor(30..135°)`: 135° sees ~286 px all around the turret heading, 90° is the 350 px default, 45° is a ~589 px sniper beam, and 30° is a **750 px laser focus**. A live overlay shows every tank's true wedge and highlights exactly what it detects.
- **Teams with a comms channel.** Group tanks into teams (each needs ≥2 members, so n tanks allow at most ⌊n/2⌋ teams). `send_team(data)` relays anything JSON-serializable to teammates — scouts report enemy positions, the pack converges. Sensors flag `is_teammate`; friendly fire is real. Matches end when one team remains.
- **Point-buy loadouts.** Each bot declares up to 8 points of modules in its script (`loadout = ['armor', 'shield', 'gyro']`): engine (+speed/−HP), armor (+HP/−speed), gyro (faster turret), radar (`ping()` sees everyone for a tick — but everyone hears it), shield (absorb 25 damage, cannon locked while up), afterburner (+80% speed, then fatigue). Every benefit has a coupled cost; ability blocks auto-equip their module in blocks mode.
- **Three arenas.** Symmetric pillars, seeded-random scatter, or open ground — plus a seed picker for reproducible matches.
- **Spectator tools.** Pause and 1×/2×/4× speed, per-tank HP bars with team and module badges, a bot console streaming each script's `print()` output and errors, shield/afterburner visual effects, and a big winner banner.

## Quick start

```sh
npm install
npm run dev
```

Open the printed URL, pick scripts for 2–8 players, optionally assign teams, and hit **Start battle**. The first battle takes a few seconds to load the Python runtime (Pyodide, from CDN).

## Writing a bot

```python
from battletanks import Bot

class MyBot(Bot):
    loadout = ['radar', 'engine']          # 6 of 8 points

    def on_tick(self, state):
        me = state.me
        enemies = [t for t in state.sensor.tanks if not t.is_teammate]
        if enemies:
            target = enemies[0]
            self.send_team({'x': target.x, 'y': target.y})   # tell the pack
            self.turn_turret_to(me.turret_heading + target.bearing)
            if abs(target.bearing) < 5 and me.cooldown == 0:
                self.fire(3 if target.distance < 180 else 1)
        elif me.radar.cooldown == 0:
            self.ping()                     # find someone (everyone hears it)
        else:
            self.set_sensor(45)             # sniper beam while searching
            self.turn_turret(1.0)
            self.drive(0.6)

    def on_hit(self, event):
        self.turn(1.0)                      # evade
```

Bots react through handlers (`on_tick`, `on_hit`, `on_collision`, `on_detected_tank`, …) and persistent intents — `drive(1.0)` keeps driving until changed. See [`docs/SPEC.md`](docs/SPEC.md) for the complete rules, API reference, and tunable constants.

## Development

```sh
npm test                    # 163 unit + integration tests (runs real Python via Pyodide in Node)
npm run test:coverage       # coverage on the logic layers
npm run build               # typecheck + production build
node scripts/e2e-smoke.mjs  # headless-Chrome smoke test (after build)
```

Built with TypeScript, Phaser 4, Vite, Blockly, and Pyodide. Architecture in brief: `src/core/` is the pure deterministic simulation, `src/bots/` bridges it to sandboxed Python, `src/blocks/` compiles block programs to bot code, and the renderer is a pure view of simulation snapshots — see [`CLAUDE.md`](CLAUDE.md) for the full map.
