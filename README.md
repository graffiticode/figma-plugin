# Graffiticode FigJam Plugin

A FigJam plugin that renders Graffiticode content onto a FigJam board. It fetches compiled data from the Graffiticode API and creates native FigJam nodes.

Currently supports **ellipses** (L0172). The renderer registry is extensible to other Graffiticode languages.

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
2. Enter a Graffiticode **Item ID** (e.g. `2FGK3MRsba`)
3. Enter your **Access Token** (optional for public items)
4. Click **Draw**

The plugin fetches the compiled data from `api.graffiticode.org`, detects the data shape, and creates the corresponding FigJam nodes. The viewport scrolls and zooms to frame the result.

### What happens on Draw

- All previously created Graffiticode nodes are removed (tagged via plugin data)
- New nodes are created from the compiled data
- Ellipses become `EllipseNode`s with fill, stroke, and opacity
- Labels become sticky notes positioned below each ellipse

### Updating content

Edit the Graffiticode item (via the console or MCP tools), then click **Draw** again in the plugin. The old nodes are replaced with the new ones.

## Supported renderers

| Data shape | Language | Renderer |
|-----------|----------|----------|
| `{ ellipses: [...] }` | L0172 | Ellipses with position, size, fill, stroke, opacity, labels |

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
