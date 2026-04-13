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

## Auth / fetch chain (UI side)

Draw triggers a 3-hop fetch, all from the UI iframe:

1. `identitytoolkit.googleapis.com` — exchange API key for a Firebase ID token (cached 55 min).
2. `console.graffiticode.org/api` — GraphQL `item(id)` query to resolve the user-facing item ID to a compiled `taskId`. This endpoint runs with `origin: null` from Figma; the console's CORS middleware must allow it (already fixed in console repo, `src/pages/api/index.ts`).
3. `api.graffiticode.org/data?id=<taskId>` — fetch the compiled JSON.

Any of these returning non-2xx surfaces as "Failed to fetch X" in the plugin UI. Check the Figma devtools console (Plugins → Development → Show/Hide Console) for the actual failing URL.

## Renderer Registry

`getRenderer()` in `code.ts` inspects the data shape and returns the matching draw function. Currently only `drawEllipses` is registered (matches `data.ellipses`). To add a new renderer: add a draw function that returns item count, register it in `getRenderer()` by matching a data property.

All nodes created by the plugin are tagged with `pluginData('source', 'graffiticode')` so they can be cleared on the next draw cycle.

## Network

The plugin can only reach hosts listed in `manifest.json` → `networkAccess.allowedDomains` (currently: api, auth, console graffiticode.org + identitytoolkit.googleapis.com). Any new backend call requires adding the host here. All fetches run in the UI iframe (sandbox has no network access).

## Reloading after changes

Rebuild with `npm run build`, then in Figma use **Plugins → Development → Graffiticode** again — Figma reloads `dist/` each run. No hot reload.
