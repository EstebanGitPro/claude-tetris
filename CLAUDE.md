# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla Tetris: HTML5 Canvas + CSS + one JS file. No `package.json`, no bundler, no transpiler, no tests, no lint config. Nothing to build or install.

## Running

```bash
open index.html                # direct file:// works, no modules involved
python3 -m http.server 8000    # or any static server
```

There is no test runner. Verification is manual: load the page and play.

## Architecture

Four files, all top-level: `index.html` (DOM + two canvases), `style.css`, `game.js` (all logic, ~300 lines), `README.md`.

`game.js` is a single IIFE-less script under `'use strict'`, running on module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`). `init()` resets all of it and is also the restart-button handler. Everything is global-by-file; there are no classes or modules.

### The one invariant that ties the data model together

A cell value is simultaneously the piece type, the shape marker, and the color index. `PIECES[3]` (the T piece) is filled with literal `3`s, and `COLORS[3]` is the T color. `board[r][c]` stores that same number, `0` meaning empty. So `drawBlock` can early-return on falsy and `collide` can test truthiness without ever knowing which piece it is looking at.

Consequence: **`PIECES`, `COLORS`, and the index used inside each shape matrix must stay aligned.** Adding a piece means appending to both arrays and filling the new matrix with the new index. Both arrays start with a `null` slot to keep indices 1–8.

### Rotation

`rotateCW` transposes + reverses into a fresh matrix (shapes are never mutated in place; `randomPiece` deep-copies from `PIECES`). `tryRotate` applies naive wall kicks by trying x-offsets `[0, -1, 1, -2, 2]` and taking the first that clears `collide`. This is **not** SRS — there is no rotation-state tracking and no I-piece kick table. Don't assume standard Tetris guideline behavior.

### Game loop and lock

`loop(ts)` accumulates `dt` into `dropAccum`; crossing `dropInterval` moves the piece down one row or calls `lockPiece()` → `merge()` → `clearLines()` → `spawn()`. There is **no lock delay** — a piece resting on the stack locks the instant the drop timer fires. Soft drop and hard drop call `lockPiece()` directly, so they can lock a piece mid-frame.

`clearLines` splices full rows out and unshifts empty ones at the top, decrementing nothing — it compensates with `r++` after a clear because the loop runs bottom-up.

Speed: `dropInterval = max(100, 1000 - (level - 1) * 90)`, level = `floor(lines / 10) + 1`.

### Known trap: the loop does not stop on game over

`endGame()` sets `gameOver = true` and calls `cancelAnimationFrame(animId)`, but it is reached from inside a currently-executing `loop` frame — cancelling an already-fired callback is a no-op, and `loop` then unconditionally re-schedules itself. `loop` never checks `gameOver`. Pieces keep falling and locking behind the overlay. `init()` happens to recover because it cancels the pending frame. If you touch the loop or the end-game path, account for this.

## Canvas sizing is duplicated in HTML

`COLS × BLOCK` and `ROWS × BLOCK` in `game.js` must equal the `width`/`height` attributes of `<canvas id="board">` in `index.html` (currently 300×600). The preview uses its own hardcoded `NB = 30` inside `drawNext`, centered against a fixed 4×4 grid, against `<canvas id="next-canvas">` at 120×120. Changing block size means editing both files.

## Conventions

User-facing strings (README, overlay text, control labels, HTML `lang="es"`) are in Spanish; code identifiers and comments are English. Keep new UI copy Spanish and new code English to match.
