# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build

```bash
npm run build          # Full build (TypeScript + copy UI)
npm run build:code     # TypeScript only → dist/code.js
npm run build:ui       # Copy src/ui.html → dist/ui.html
```

No test runner or linter is configured. TypeScript strict mode is enabled via `tsconfig.json`.

## Architecture

This is a FigJam plugin (not Figma design — `editorType: ["figjam"]` in manifest.json). It has the standard Figma plugin two-process architecture:

- **Sandbox** (`src/code.ts` → `dist/code.js`): Runs in Figma's plugin sandbox with access to the Figma document API. Contains color utilities, renderer functions, and the message handler entry point. TypeScript compiles with `module: "none"` (no bundler, single output file).
- **UI** (`src/ui.html` → `dist/ui.html`): Runs in an iframe. Handles user input (item ID, access token), fetches compiled data from `https://api.graffiticode.org/data`, and sends it to the sandbox via `postMessage`.

Communication flow: UI fetches JSON from Graffiticode API → sends `{type: 'draw', data}` message to sandbox → sandbox selects a renderer via `getRenderer()` and creates FigJam nodes → posts `draw-complete` or `error` back to UI.

## Renderer Registry

`getRenderer()` in `code.ts` inspects the data shape and returns the matching draw function. Currently only `drawEllipses` is registered (matches `data.ellipses`). To add a new renderer: add a draw function that returns item count, register it in `getRenderer()` by matching a data property.

All nodes created by the plugin are tagged with `pluginData('source', 'graffiticode')` so they can be cleared on the next draw cycle.

## Network

The plugin can only reach `https://api.graffiticode.org` (allowlisted in manifest.json `networkAccess`). API calls happen in the UI iframe, not the sandbox.
