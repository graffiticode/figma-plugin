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
- **UI** (`src/ui.html` → `dist/ui.html`): Runs in an iframe. Handles user input (API key, item IDs), fetches each item's compiled data through the console GraphQL `itemData(id)` query, polls for changes, and sends it to the sandbox via `postMessage`.

Communication flow: UI fetches JSON from Graffiticode API → sends `{type: 'draw', data}` message to sandbox → sandbox selects a renderer via `getRenderer()` and creates FigJam nodes → posts `draw-complete` or `error` back to UI.

## Auth / fetch chain (UI side)

1. `auth.graffiticode.org/authenticate/api-key` — exchange the API key for a Firebase custom token, then `identitytoolkit.googleapis.com` for an ID token (cached 55 min).
2. `console.graffiticode.org/api` — GraphQL `itemData(id)` returns the item's compiled JSON. `{data, errors}` and `_` wrappers are peeled off in any order; errors stop the watch.

## The board contract

`getRenderer()` matches `data.type === 'board'` → `drawBoard`. Two producers:

- **L0186** (`graffiticode/languages/l0186`): `{type: "board", pages: [{name, background?, nodes}], fileKey?}`. FigJam's plugin API cannot create pages, so `pickPage` draws the page named like `figma.currentPage`, else the first. `fileKey` (from `save-to-figjam`) must match `figma.fileKey` when the plugin can read it (`wrongFile`).
- **L0172** (legacy): `{type: "board", nodes, fileKey?}`.

Nodes: `sticky`, `shape`, `text`, `section` (children drawn first, section fitted to them + 24px and children centred), `stamp` (a 40px circle + emoji), `connector` (ends by `primaryKey`: id else text, a section's name, a stamp's reaction; lists and `"*"` fan out). L0186's SVG preview mirrors these placement rules in `languages/l0186/packages/view/src/lib/layout.ts` — **change both together**, or the preview stops matching what the plugin draws.

All nodes are tagged `pluginData('source', 'graffiticode')` and `('itemId', …)`; a redraw clears the item's nodes on the current page only, so each FigJam page can hold a different board page.

## Network

The plugin can only reach hosts listed in `manifest.json` → `networkAccess.allowedDomains` (currently: api, auth, console graffiticode.org + identitytoolkit.googleapis.com). Any new backend call requires adding the host here. All fetches run in the UI iframe (sandbox has no network access).

## Reloading after changes

Rebuild with `npm run build`, then in Figma use **Plugins → Development → Graffiticode** again — Figma reloads `dist/` each run. No hot reload.
