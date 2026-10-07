# Graffiticode FigJam Plugin

A FigJam plugin that renders Graffiticode content onto a FigJam board. It fetches compiled data from the Graffiticode API and creates native FigJam nodes.

It draws **FigJam boards** compiled by L0186 (and by its predecessor L0172): sticky notes, text, shapes with text, sections, stamps and connectors. An L0186 program that starts with `save-to-figjam "<FigJam link>"` names the file this plugin draws it into.

## Setup

```bash
npm install
npm run build
```

## Loading the plugin in Figma

1. Open a FigJam board in the Figma desktop app
2. Go to **Plugins > Development > Import plugin from manifest...**
3. Select the `manifest.json` file from this repo
4. The plugin appears under **Plugins > Development > Graffiticode**

## Using the plugin

1. Run the plugin from **Plugins > Development > Graffiticode**
2. Enter your Graffiticode **API Key**
3. Add one or more Graffiticode **Item IDs** (e.g. `2FGK3MRsba`)
4. Click **Watch**: the plugin draws each checked item and redraws it whenever it changes (polling every 3s)

The API key is exchanged (via `auth.graffiticode.org`) for a Firebase ID token, cached for 55 minutes. Each item's compiled data comes from the console GraphQL query `itemData(id)`; `{data, errors}` and `_` wrappers are peeled off, and compile errors are shown instead of drawing.

### What happens on a draw

- The item's previously drawn nodes on the current FigJam page are removed (they are tagged with plugin data `source` and `itemId`)
- New nodes are created from the compiled board, and the viewport frames them
- If the board was saved to a different FigJam file (`fileKey`), nothing is drawn and the plugin says which file it belongs to (when the plugin can read the current file's key)

### Pages

An L0186 board has one or more pages. The plugin API cannot create pages in FigJam, so the plugin draws one page into the current FigJam page: the board page with the same name, or else the first. To draw another page, switch to (or rename) a FigJam page with that page's name and draw again; the status line lists the board's other pages.

## The board contract

| Data shape | Language | Renderer |
|-----------|----------|----------|
| `{ type: "board", pages: [{ name, background?, nodes }], fileKey? }` | L0186 | `drawBoard`, one page |
| `{ type: "board", nodes: [...], fileKey? }` | L0172 | `drawBoard` |

Nodes are `sticky`, `shape` (`shapeType` in Figma's enum spelling), `text`, `section` (with nested `nodes`), `stamp` and `connector` (`from`/`to` naming a node's id, text, a section's name or a stamp; a list; or `"*"`). L0186's SVG preview (`graffiticode/languages/l0186/packages/view/src/lib/layout.ts`) mirrors this file's placement rules — change them together.

## Adding a new renderer

1. Add a draw function in `src/code.ts` that accepts the compiled data and returns the number of items created
2. Register it in `getRenderer()` by matching the data shape
3. Rebuild with `npm run build`

## Project structure

```
manifest.json    -- Figma plugin manifest (FigJam only)
src/code.ts      -- Plugin sandbox: color utils, renderers, entry point
src/ui.html      -- Plugin UI: item ID input, fetch, status display
```

## License

MIT
