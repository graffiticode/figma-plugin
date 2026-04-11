/// <reference types="@figma/plugin-typings" />

// --- Color utilities ---

function hexToFigma(hex: string): RGB {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return { r, g, b };
}

const namedColors: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  orange: '#f97316',
  pink: '#ec4899',
  white: '#ffffff',
  black: '#000000',
  gray: '#6b7280',
};

function resolveColor(color: string): RGB {
  if (color.startsWith('#')) {
    return hexToFigma(color);
  }
  const hex = namedColors[color.toLowerCase()];
  if (hex) {
    return hexToFigma(hex);
  }
  return { r: 0.5, g: 0.5, b: 0.5 };
}

// --- Ellipses renderer ---

async function drawEllipses(data: { ellipses: any[] }): Promise<number> {
  const existing = figma.currentPage.findAll(
    n => n.getPluginData('source') === 'graffiticode'
  );
  for (const node of existing) {
    node.remove();
  }

  const items = data.ellipses || [];
  const created: SceneNode[] = [];

  for (const item of items) {
    const cx = item.x ?? 200;
    const cy = item.y ?? 150;
    const w = item.width ?? 150;
    const h = item.height ?? 100;

    const ellipse = figma.createEllipse();
    ellipse.x = cx - w / 2;
    ellipse.y = cy - h / 2;
    ellipse.resize(w, h);

    const fillColor = resolveColor(item.fill || '#93c5fd');
    ellipse.fills = [{
      type: 'SOLID',
      color: fillColor,
      opacity: (item.opacity ?? 100) / 100,
    }];

    if (item.stroke) {
      const strokeColor = resolveColor(item.stroke);
      ellipse.strokes = [{
        type: 'SOLID',
        color: strokeColor,
      }];
      ellipse.strokeWeight = item.strokeWidth ?? 2;
    }

    ellipse.setPluginData('source', 'graffiticode');
    created.push(ellipse);

  }

  if (created.length > 0) {
    figma.viewport.scrollAndZoomIntoView(created);
  }

  return items.length;
}

// --- Renderer registry ---

type Renderer = (data: any) => Promise<number>;

function getRenderer(data: any): Renderer | null {
  if (data.ellipses) {
    return drawEllipses;
  }
  return null;
}

// --- Plugin entry point ---

figma.showUI(__html__, { width: 320, height: 300 });

// Load saved credentials and send to UI
Promise.all([
  figma.clientStorage.getAsync('apiKey'),
  figma.clientStorage.getAsync('itemId'),
]).then(([apiKey, itemId]) => {
  figma.ui.postMessage({ type: 'init', apiKey: apiKey || '', itemId: itemId || '' });
});

figma.ui.onmessage = async (msg: { type: string; data?: any; apiKey?: string; itemId?: string }) => {
  if (msg.type === 'save') {
    if (msg.apiKey) { figma.clientStorage.setAsync('apiKey', msg.apiKey); }
    if (msg.itemId) { figma.clientStorage.setAsync('itemId', msg.itemId); }
  } else if (msg.type === 'draw') {
    const renderer = getRenderer(msg.data);
    if (!renderer) {
      figma.ui.postMessage({
        type: 'error',
        message: 'Unrecognized data format. No renderer available.',
      });
      return;
    }
    const count = await renderer(msg.data);
    figma.ui.postMessage({ type: 'draw-complete', count });
  }
};
