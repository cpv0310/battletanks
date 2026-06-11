# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BattleTanks is a browser-based programming game: 2–8 tanks battle in a 1200×1000 arena, each controlled by a player-written Python script (run via Pyodide). Last tank alive wins. The full game design is in **`docs/SPEC.md`** — read it before implementing gameplay features.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — typecheck (`tsc`) and produce a production build in `dist/`
- `npm test` — run all tests once (Vitest)
- `npm run test:watch` — run tests in watch mode
- `npx vitest run src/core/movement.test.ts` — run a single test file
- `npm run test:coverage` — run tests with V8 coverage
- `npm run typecheck` — typecheck without emitting

## Architecture

The core split is **pure game logic vs. Phaser presentation**:

- `src/core/` — pure, framework-free functions (movement math, and future game rules). This code is immutable-style (returns new values, never mutates), runs under Vitest in a plain Node environment, and is where unit tests live (colocated as `*.test.ts`). Coverage is measured only against this layer (see `vite.config.ts`).
- `src/scenes/` — Phaser scenes. They own game objects, input, and physics bodies, and delegate any math/rules to `src/core/`. Scenes are excluded from coverage because they require a browser/WebGL context.
- `src/config.ts` — shared gameplay constants (dimensions, speeds). Put tunable values here, not inline.
- `src/main.ts` — entry point; constructs the `Phaser.Game` with arcade physics and registers scenes.

When adding gameplay features, write the rules/math as pure functions in `src/core/` with tests first, then wire them into a scene.

Screen coordinates: y increases downward, so angle `PI/2` points down. Angles are normalized to `(-PI, PI]` via `normalizeAngle`.
