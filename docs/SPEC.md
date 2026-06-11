# BattleTanks — Game Specification

Version 0.1 (draft)

## 1. Overview

BattleTanks is a browser-based programming game. Players do not drive their tanks
directly — instead, each player loads a **Python script** that controls their tank:
how it moves, turns its turret, scans for enemies, and shoots. Scripts for all
tanks run against a deterministic simulation, and the match plays out in the
browser with no server required.

**Win condition:** the last player with a tank alive on the battlefield wins.

## 2. Match Rules

- **Players:** 2–8 tanks per match, one script per tank. The same script may be
  loaded for multiple tanks (e.g., to test a bot against itself).
- **Start:** tanks spawn at fair, well-separated positions (see §3.3), at full HP.
- **Elimination:** a tank is destroyed when its HP reaches 0. Destroyed tanks are
  removed from the field (leaving no wreck in v1).
- **End:** the match ends when at most one tank remains, or when the time limit
  is reached.
- **Time limit:** 3 minutes of simulated time. On timeout, the surviving tank
  with the highest HP wins; equal HP is a draw between those tanks.
- **Disqualification:** a script that crashes or persistently exceeds its compute
  budget (§7.5) has its tank rendered inert (it keeps its last commands but can
  issue no new ones). It can still be destroyed normally.

## 3. Arena

### 3.1 Dimensions

- The arena is **1200 × 1000** pixels, enclosed by indestructible walls.
- Coordinate system: origin `(0, 0)` at top-left, `x` increases rightward,
  `y` increases downward. Angles: `0°` points right (+x), increasing clockwise
  (matching screen coordinates).

### 3.2 Obstacles

- Obstacles are **axis-aligned rectangles**, indestructible in v1.
- They block tank movement, shells, and sensor line of sight.
- Maps are either **preset layouts** or **seeded-random generation** (same seed →
  same map). Generated maps must guarantee:
  - No obstacle within 80 px of any spawn point.
  - All spawn points mutually reachable (no sealed-off regions).
  - Obstacle coverage between 5% and 15% of arena area.

### 3.3 Spawning

- Spawn points are distributed around the arena (e.g., a perimeter ring),
  at least **250 px** apart, never inside or adjacent to obstacles.
- Spawn assignment and initial hull/turret headings are randomized from the
  match seed.

## 4. The Tank

Each tank has two independently rotating parts: the **hull** and the **turret**.

### 4.1 Hull

| Property | Value (default) |
|---|---|
| Size | 40 × 30 px (oriented bounding box) |
| Hit points | 100 |
| Max forward speed | 150 px/s |
| Max reverse speed | 75 px/s |
| Hull rotation speed | 90°/s |

- The hull drives in the direction it is facing (forward or reverse).
- Hulls collide with walls, obstacles, and other tanks: movement is blocked,
  no damage is dealt by collisions in v1.

### 4.2 Turret

- Mounted on the hull; carries the **cannon** and the **sensor**, which always
  point the same direction (the turret heading).
- Rotates independently of the hull at up to **180°/s**.
- Turret heading is tracked in world coordinates; the API exposes both world
  heading and heading relative to the hull.

### 4.3 Cannon

| Property | Value (default) |
|---|---|
| Shell speed | 600 px/s |
| Shell damage | 20 |
| Cooldown | 1.0 s |

- `fire()` launches a shell from the turret tip along the turret heading.
- Shells travel in a straight line until they hit a tank, an obstacle, or a wall.
  Obstacle/wall hits destroy the shell with no effect. No splash damage in v1.
- A tank can have multiple shells in flight; the only limit is the cooldown.
- Firing while on cooldown is a no-op (the API exposes remaining cooldown).

### 4.4 Sensor

| Property | Value (default) |
|---|---|
| Arc | **90°**, centered on the turret heading |
| Range | 350 px |
| Update | every tick, automatically |

- The sensor reports everything inside its arc and range **with unobstructed
  line of sight** (obstacles and walls block sensing; other tanks do not).
- Detections are delivered in the bot's tick state (§6.2):
  - **Tanks:** id, distance, bearing (relative to turret heading), hull heading,
    and current speed. HP of enemies is *not* exposed.
  - **Obstacles:** distance and bearing to the nearest visible point, plus the
    obstacle's bounding rectangle.
  - **Walls:** distance and bearing to the wall intersection along the turret
    heading, if within range.
- To search the battlefield, bots sweep the turret (and thus the sensor arc).

## 5. Simulation Model

- The simulation is **tick-based and deterministic**: fixed timestep of
  **60 ticks per simulated second**. Same scripts + same seed → identical match.
- Each tick:
  1. The engine builds a state snapshot for every living tank (own status,
     sensor detections, events since last tick).
  2. Each bot's `on_tick` runs (sequentially, in a fixed shuffled-by-seed order)
     and buffers commands.
  3. All buffered commands are applied **simultaneously**: rotations and speeds
     clamped to their maxima, then physics integrates one step.
  4. Shell movement, collisions, damage, and eliminations are resolved.
- Commands are **persistent intents**: `drive(1.0)` keeps the tank driving at
  full speed every subsequent tick until changed — bots do not need to reissue
  commands each tick.
- Randomness available to bots comes from a **seeded RNG** in the API, so
  matches stay reproducible.
- The renderer (Phaser) is a pure view of simulation state and can play the
  match at 1×, accelerated, or paused without affecting the outcome.

## 6. Python Bot API

### 6.1 Script shape

A bot script defines a subclass of `Bot` and is instantiated once per tank:

```python
from battletanks import Bot

class HunterBot(Bot):
    def on_start(self, info):
        # called once; info has arena size, own id, match seed
        self.sweep_dir = 1

    def on_tick(self, state):
        if state.sensor.tanks:
            target = state.sensor.tanks[0]
            self.turn_turret_to(state.me.turret_heading + target.bearing)
            if abs(target.bearing) < 3 and state.me.cooldown == 0:
                self.fire()
        else:
            self.turn_turret(self.sweep_dir)   # sweep to search
            self.drive(0.5)

    def on_hit(self, event):
        self.turn(1.0)  # evade when shot
```

### 6.2 Tick state (`state`)

| Field | Contents |
|---|---|
| `state.tick` | current tick number |
| `state.me` | `x`, `y`, `heading`, `turret_heading` (world), `turret_relative` (vs hull), `speed`, `hp`, `cooldown` (seconds until cannon ready), `stuck` (movement was obstructed last tick), `at_wall` (hull touching an arena wall), `wall_bearing` (bearing to the touched wall relative to the hull, or `None`) |
| `state.sensor.tanks` | list of detected tanks: `id`, `distance`, `bearing`, `heading`, `speed` |
| `state.sensor.obstacles` | list of visible obstacles: `distance`, `bearing`, `rect` |
| `state.sensor.wall` | wall intersection along turret heading (`distance`, `bearing`) or `None` |
| `state.events` | events since last tick: `hit_by_shell`, `shell_hit_enemy`, `collision`, `enemy_destroyed` |
| `state.alive_count` | number of tanks still alive |

### 6.3 Commands

| Command | Effect |
|---|---|
| `self.drive(v)` | set drive speed, `v` ∈ [-1, 1] of max (negative = reverse) |
| `self.turn(r)` | set hull turn rate, `r` ∈ [-1, 1] of max (negative = counter-clockwise) |
| `self.turn_turret(r)` | set turret turn rate, `r` ∈ [-1, 1] of max |
| `self.turn_to(deg)` / `self.turn_turret_to(deg)` | turn toward an absolute world heading (engine steers at max rate and stops there) |
| `self.fire()` | fire if cooldown is 0 (one-shot, not persistent) |
| `self.rng` | seeded `random.Random` instance for reproducible randomness |

Angles in the API are **degrees**; distances are pixels; speeds are fractions of
the tank's maximum. Invalid values are clamped, never errors.

### 6.4 Event handlers (all optional except `on_tick`)

- `on_start(info)` — once, before the first tick.
- `on_tick(state)` — every tick (required).
- `on_hit(event)` — took shell damage (`damage`, `bearing` of impact).
- `on_collision(event)` — hit a wall/obstacle/tank (`kind`, `bearing`).
- `on_detected_tank(detection)` — a tank newly entered the sensor arc.
- `on_destroyed()` — own tank eliminated (for cleanup/learning, no commands).

### 6.5 Constraints & sandboxing

- Scripts run in **Pyodide** (CPython compiled to WebAssembly) inside a Web
  Worker — no network, filesystem, or DOM access. Imports limited to the Python
  standard library subset (`math`, `random`, etc.) plus the `battletanks` module.
- **Compute budget:** ~10 ms of CPU per tick per bot. An overrunning tick is
  cut off (tank keeps its previous commands). Exceeding the budget for 120
  consecutive ticks renders the tank inert (§2).
- Bots can keep state on `self` between ticks; they cannot access engine
  internals, other bots, or the full world state — only what §6.2 provides.

## 7. User Interface

- **Setup screen:** add 2–8 players; for each, load a `.py` file or paste into a
  code editor; choose map preset or seed; start match.
- **Visual programming:** every script has a **Code / Blocks** editing-mode
  toggle. Blocks mode is a drag-and-drop Blockly workspace with tank-specific
  blocks — events (*every tick*, *when I see an enemy*, *when I get hit*,
  *when I touch a wall*, *when I am stuck*), actions (drive, turn, spin/aim
  turret, chase, fire, say), and logic (if / if-else plus conditions like
  *enemy is closer than N px*, *turret is aimed*, *cannon is ready*, *HP below
  N*, *% chance*). Block programs compile to Python bots (visible via the Code
  toggle) and save to the script library alongside hand-written scripts.
- **Battle view:** Phaser renders the 1200 × 1000 arena (scaled to fit), tanks
  with visible hull/turret orientation, shells, obstacles, and an optional
  sensor-arc overlay for debugging.
- **HUD:** per-tank name, color, and HP bar; match clock; alive count.
- **Controls:** pause/resume, simulation speed (1×/2×/4×), restart with same
  seed, restart with new seed.
- **Bot console:** per-bot panel showing `print()` output and Python errors,
  essential for script debugging.
- **Result screen:** winner (or draw), survival times, damage dealt.

## 8. Technical Architecture

- `src/core/` — the **entire simulation** (arena, tanks, shells, sensor
  geometry, collision, tick loop) as pure, framework-free, immutable-style
  TypeScript: `step(state, commands) → newState`. Fully unit-testable; this is
  where determinism lives.
- `src/bots/` — Pyodide integration: worker lifecycle, loading user scripts,
  the `battletanks` Python module, the per-tick state/commands bridge, compute
  budget enforcement.
- `src/scenes/` — Phaser rendering of simulation snapshots plus HUD; no game
  rules.
- The engine never trusts script output: all commands are schema-validated and
  clamped at the bridge boundary before entering the simulation.

## 9. Tunable Constants (defaults)

All values live in `src/config.ts` and may be rebalanced freely.

| Constant | Default |
|---|---|
| Arena | 1200 × 1000 px |
| Tick rate | 60 / simulated second |
| Match time limit | 3 min (10,800 ticks) |
| Tank HP | 100 |
| Tank size | 40 × 30 px |
| Forward / reverse speed | 150 / 75 px/s |
| Hull / turret rotation | 90 / 180 °/s |
| Shell speed / damage / cooldown | 600 px/s / 20 / 1.0 s |
| Sensor arc / range | 90° / 350 px |
| Bot CPU budget per tick | 10 ms |

## 10. Open Questions (deferred from v1)

1. Ram damage for tank-on-tank collisions?
2. Destructible obstacles or cover that degrades?
3. Energy/heat system tying movement, scanning, and firing to a shared budget
   (Robocode-style) instead of a simple cooldown?
4. Should enemies' HP be visible to the sensor?
5. Team modes (2v2, 4v4) and shared team telemetry?
6. Persistent tournaments / leaderboards (requires a server)?
