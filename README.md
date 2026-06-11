# BattleTanks

A browser-based programming game. You don't drive the tanks — you **program** them in Python, then watch your bot fight up to seven others in a 1200×1000 arena. Last tank standing wins.

## Quick start

```sh
npm install
npm run dev
```

Open the printed URL, pick scripts for 2–8 players (start with the built-in samples), and hit **Start battle**. The first battle takes a few seconds to load the Python runtime (Pyodide, from CDN).

## Writing a bot

Bots are Python scripts that subclass `Bot`. Pick a sample in the script editor, tweak it, and **Save** it to your browser's script library:

```python
from battletanks import Bot

class MyBot(Bot):
    def on_tick(self, state):
        if state.sensor.tanks:                      # someone in the 90° sensor arc?
            target = state.sensor.tanks[0]
            self.turn_turret_to(state.me.turret_heading + target.bearing)
            if abs(target.bearing) < 4 and state.me.cooldown == 0:
                self.fire()
        else:
            self.turn_turret(1.0)                   # sweep to search
            self.drive(0.5)
```

Each tank has a hull, an independently rotating turret, a cannon, and a sensor (90° arc, 350 px, blocked by obstacles). See [`docs/SPEC.md`](docs/SPEC.md) for the complete rules and bot API.

## Development

```sh
npm test                    # unit + Pyodide integration tests
npm run build               # typecheck + production build
node scripts/e2e-smoke.mjs  # headless-Chrome smoke test (after build)
```

Built with TypeScript, Phaser 4, Vite, and Pyodide. The simulation is deterministic — same scripts + same seed replay the identical battle.
