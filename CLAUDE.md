# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BattleTanks is a browser-based programming game: 2–8 tanks battle in a 1200×1000 arena, each controlled by a player-written Python script (run via Pyodide in a Web Worker). Last tank alive wins. The full game design is in **`docs/SPEC.md`** — read it before implementing gameplay features.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — typecheck (`tsc`) and produce a production build in `dist/`
- `npm test` — run all tests once (Vitest; includes the Pyodide integration tests, which run in Node)
- `npx vitest run src/core/step.test.ts` — run a single test file
- `npm run test:coverage` — coverage (measured on `src/core`, `src/bots/sanitize.ts`, `src/ui/storage.ts`)
- `npm run typecheck` — typecheck without emitting
- `node scripts/e2e-smoke.mjs` — browser smoke test: serves the built app in headless Chrome, starts a real match, asserts the sim ticks. Requires `npm run build` first, Google Chrome, and network (Pyodide CDN).

## Architecture

Three strictly separated layers; data flows sim → worker → renderer:

- `src/core/` — the **entire game simulation** as pure, framework-free, immutable TypeScript. `step(state, intents) → newState` advances one tick (60/s); `match.ts` creates matches and decides winners; `sensor.ts` computes 90°-arc line-of-sight detections. Deterministic: same scripts + same seed → identical match (`rng.ts` mulberry32). All angles here are **radians**; tanks are collision circles (`TANK_RADIUS`).
- `src/bots/` — Python integration. `engine.ts` (`MatchEngine`) drives a match: builds per-bot state JSON (snake_case, **degrees** — converted at this boundary), calls Python, sanitizes returned commands (`sanitize.ts` — never trust bot output), enforces the per-tick CPU budget, and steps the core sim. It is runtime-agnostic: the browser worker (`worker.ts`, Pyodide from CDN) and the Node integration tests (`engine.integration.test.ts`, pyodide npm package) both feed it through `pyRuntime.ts`. `python/battletanks.py` is the player-facing API; `python/runner.py` loads/ticks bots; `samples/*.py` are the built-in example bots. The main thread talks to the worker via `client.ts` (watchdog: a hung bot kills the worker, not the page).
- `src/scenes/` + `src/ui/` + `src/app.ts` — presentation. `BattleScene` is a pure view of worker snapshots (no game rules); `app.ts` paces the sim by requesting `speed` ticks per rendered frame. `ui/setupPanel.ts` owns the script library (samples + localStorage saves via `ui/storage.ts`); `ui/battlePanel.ts` owns HUD/console/results.
- `src/blocks/` — the visual programming mode: Blockly with custom tank blocks (`definitions.ts`), a Python generator (`generator.ts`, headless-testable via `blocksJsonToPython`), sample/starter workspaces (`sample.ts`), and the workspace UI wrapper (`editor.ts`). Block programs are stored as serialized workspace JSON next to their generated Python; the engine only ever sees the Python. When adding a block: define it, add a generator case, add it to `TANK_TOOLBOX`, and cover it in `generator.test.ts`.

Key invariants:
- Commands are **persistent intents** (a bot's `drive(1.0)` persists until changed); `fire` is one-shot and reset every tick in `MatchEngine`.
- Teams: tanks carry `team: number | null` in core; win conditions group by team (solo = own team). The team message channel lives in `MatchEngine` (mailbox delivered next tick, capped per `MAX_TEAM_MESSAGES_*`), never in the core sim — messages don't affect physics.
- The turret is mounted on the hull: hull rotation carries the turret (see `applyRotation` in `step.ts`).
- Bot crashes/budget overruns make that tank **inert**, never abort the match.
- Screen coordinates: y down, angle 0 = +x, increasing clockwise; bot-facing API uses degrees, core uses radians.

When adding gameplay features: rules/math go in `src/core/` with tests first; expose to bots via `buildBotState` in `engine.ts` + `battletanks.py`; render in `BattleScene`. Tunables live in `src/config.ts`, mirrored in the spec's constants table.
