/// <reference types="@figma/plugin-typings" />

// --- Color utilities ---

function hexToFigma(hex: string): RGB | null {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
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

function resolveColor(color: unknown): RGB {
  if (typeof color !== 'string') {
    console.warn('[gc] non-string color:', color);
    return { r: 0.5, g: 0.5, b: 0.5 };
  }
  const trimmed = color.trim();
  const fallback: RGB = { r: 0.5, g: 0.5, b: 0.5 };
  if (trimmed.startsWith('#')) {
    const rgb = hexToFigma(trimmed);
    if (!rgb) console.warn('[gc] invalid hex color:', color);
    return rgb || fallback;
  }
  const hex = namedColors[trimmed.toLowerCase()];
  if (hex) {
    return hexToFigma(hex) || fallback;
  }
  console.warn('[gc] unknown color:', color);
  return fallback;
}

// --- Node tagging ---

function findAllOnAllPages(predicate: (n: SceneNode) => boolean): SceneNode[] {
  const out: SceneNode[] = [];
  for (const page of figma.root.children) {
    for (const node of page.findAll(predicate)) out.push(node);
  }
  return out;
}

function removeOrphans(): void {
  const orphans = findAllOnAllPages(
    n => n.getPluginData('source') === 'graffiticode'
      && !n.getPluginData('itemId')
  );
  for (const node of orphans) {
    if (node.removed) continue;
    try { node.remove(); } catch { /* already detached */ }
  }
}

function removeNodesForItem(itemId: string): void {
  const existing = findAllOnAllPages(
    n => n.getPluginData('source') === 'graffiticode'
      && n.getPluginData('itemId') === itemId
  );
  // Remove leaf nodes before sections so section.remove() doesn't orphan
  // earlier iterations, and guard against already-removed descendants.
  const sections: SceneNode[] = [];
  const others: SceneNode[] = [];
  for (const node of existing) {
    if (node.type === 'SECTION') sections.push(node);
    else others.push(node);
  }
  for (const node of others) {
    if (node.removed) continue;
    try { node.remove(); } catch { /* already detached */ }
  }
  for (const section of sections) {
    if (section.removed) continue;
    // Detach any untagged children so removing the section doesn't delete
    // user content that happens to live inside it.
    const sec = section as SectionNode;
    for (const child of [...sec.children]) {
      const tagged = child.getPluginData('source') === 'graffiticode'
        && child.getPluginData('itemId') === itemId;
      if (!tagged && !child.removed) {
        figma.currentPage.appendChild(child);
      }
    }
    try { sec.remove(); } catch { /* already detached */ }
  }
}

function tagNode(node: SceneNode, itemId: string): void {
  node.setPluginData('source', 'graffiticode');
  node.setPluginData('itemId', itemId);
}

// --- Board renderer ---

const DEFAULT_FONT: FontName = { family: 'Inter', style: 'Medium' };

function applyFontSize(slot: { fontSize: number | typeof figma.mixed }, n: any): void {
  if (n.fontSize != null) {
    (slot as { fontSize: number }).fontSize = Number(n.fontSize);
  }
}

function applyOpacity(node: SceneNode, n: any): void {
  if (n.opacity != null && 'opacity' in node) {
    (node as SceneNode & { opacity: number }).opacity = Math.max(0, Math.min(1, Number(n.opacity) / 100));
  }
}

function applyFill(node: SceneNode & { fills: readonly Paint[] | typeof figma.mixed }, n: any): void {
  if (n.fill) {
    (node as any).fills = [{ type: 'SOLID', color: resolveColor(n.fill) }];
  }
}

function darken(rgb: RGB, factor = 0.65): RGB {
  return { r: rgb.r * factor, g: rgb.g * factor, b: rgb.b * factor };
}

function applyStroke(
  node: SceneNode & { strokes: readonly Paint[]; strokeWeight: number | typeof figma.mixed },
  n: any,
): void {
  const weight = n['stroke-width'] ?? n.strokeWidth;
  if (n.stroke) {
    const color = resolveColor(n.stroke);
    (node as any).strokes = [{ type: 'SOLID', color }];
    (node as any).strokeWeight = weight ?? 2;
  } else if (weight != null) {
    // Stroke weight set without an explicit color — derive a darker
    // hue of the fill so FigJam's subtle-border look is preserved.
    const base = n.fill ? resolveColor(n.fill) : { r: 0.5, g: 0.5, b: 0.5 };
    (node as any).strokes = [{ type: 'SOLID', color: darken(base) }];
    (node as any).strokeWeight = weight;
  }
}

async function drawNode(n: any, itemId: string): Promise<SceneNode | null> {
  const x = n.x ?? 0;
  const y = n.y ?? 0;

  if (n.type === 'shape') {
    const shape = figma.createShapeWithText();
    shape.shapeType = (n.shapeType || 'SQUARE') as ShapeWithTextNode['shapeType'];
    shape.x = x;
    shape.y = y;
    const w = n.width != null ? Number(n.width) : shape.width;
    const h = n.height != null ? Number(n.height) : shape.height;
    if (n.width != null || n.height != null) shape.resize(w, h);
    if (n.text) {
      await figma.loadFontAsync(DEFAULT_FONT);
      shape.text.characters = String(n.text);
      applyFontSize(shape.text, n);
    }
    applyFill(shape, n);
    applyStroke(shape, n);
    applyOpacity(shape, n);
    tagNode(shape, itemId);
    return shape;
  }

  if (n.type === 'sticky') {
    const sticky = figma.createSticky();
    sticky.x = x;
    sticky.y = y;
    if (n.text) {
      await figma.loadFontAsync(DEFAULT_FONT);
      sticky.text.characters = String(n.text);
      applyFontSize(sticky.text, n);
    }
    applyFill(sticky, n);
    applyOpacity(sticky, n);
    tagNode(sticky, itemId);
    return sticky;
  }

  if (n.type === 'text') {
    await figma.loadFontAsync(DEFAULT_FONT);
    const t = figma.createText();
    t.fontName = DEFAULT_FONT;
    t.x = x;
    t.y = y;
    if (n.text) t.characters = String(n.text);
    applyFontSize(t, n);
    if (n.color) t.fills = [{ type: 'SOLID', color: resolveColor(n.color) }];
    applyOpacity(t, n);
    tagNode(t, itemId);
    return t;
  }

  if (n.type === 'section') {
    // Sections with no nested `nodes` are leaf containers; callers that
    // want nested children use `renderNodeTree` instead.
    const section = figma.createSection();
    section.x = x;
    section.y = y;
    if (n.name) section.name = String(n.name);
    const w = n.width != null ? Number(n.width) : section.width;
    const h = n.height != null ? Number(n.height) : section.height;
    if (n.width != null || n.height != null) section.resizeWithoutConstraints(w, h);
    applyFill(section as any, n);
    applyOpacity(section, n);
    tagNode(section, itemId);
    return section;
  }

  if (n.type === 'stamp') {
    // FigJam's plugin API has no createStamp; emulate a stamp as a small
    // tinted circle with the emoji glyph for the named reaction centered
    // inside it. Sized and styled to read like a native FigJam stamp.
    const STAMP_GLYPH: Record<string, string> = {
      like: '👍',
      love: '❤️',
      heart: '❤️',
      celebrate: '🎉',
      party: '🎉',
      fire: '🔥',
      hot: '🔥',
      star: '⭐',
      rocket: '🚀',
      laugh: '😂',
      smile: '😀',
      sad: '😢',
      cry: '😢',
      angry: '😠',
      thinking: '🤔',
      clap: '👏',
      eyes: '👀',
      ok: '👌',
      thumbsup: '👍',
      thumbsdown: '👎',
      check: '✅',
      cross: '❌',
      question: '❓',
      warning: '⚠️',
      bulb: '💡',
      idea: '💡',
    };
    const key = String(n.stamp ?? '').trim().toLowerCase();
    const glyph = STAMP_GLYPH[key] ?? (key || '⭐');
    const SIZE = 40;
    const ellipse = figma.createEllipse();
    ellipse.resize(SIZE, SIZE);
    ellipse.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    ellipse.strokes = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];
    ellipse.strokeWeight = 1;
    await figma.loadFontAsync(DEFAULT_FONT);
    const text = figma.createText();
    text.fontName = DEFAULT_FONT;
    text.fontSize = 22;
    text.characters = glyph;
    text.textAlignHorizontal = 'CENTER';
    text.textAlignVertical = 'CENTER';
    text.x = (SIZE - text.width) / 2;
    text.y = (SIZE - text.height) / 2;
    const stamp = figma.group([ellipse, text], figma.currentPage);
    stamp.x = x;
    stamp.y = y;
    applyOpacity(stamp, n);
    tagNode(stamp, itemId);
    return stamp;
  }

  return null;
}

function primaryKey(n: any): string | null {
  if (!n || typeof n !== 'object') return null;
  if (n.type === 'shape' || n.type === 'sticky' || n.type === 'text') {
    if (n.id != null) return String(n.id);
    return n.text != null ? String(n.text) : null;
  }
  if (n.type === 'section') return n.name != null ? String(n.name) : null;
  if (n.type === 'stamp') return n.stamp != null ? String(n.stamp) : null;
  return null;
}

function resolveEndpoints(
  spec: unknown,
  other: unknown,
  lookup: Map<string, SceneNode>,
): SceneNode[] {
  const toList = (v: unknown): string[] => {
    if (v == null) return [];
    if (Array.isArray(v)) return v.map(String);
    return [String(v)];
  };
  const specs = toList(spec);
  if (specs.length === 0) return [];
  if (specs.includes('*')) {
    const excluded = new Set(toList(other).filter(s => s !== '*'));
    const out: SceneNode[] = [];
    for (const [key, node] of lookup) {
      if (!excluded.has(key)) out.push(node);
    }
    return out;
  }
  const out: SceneNode[] = [];
  for (const s of specs) {
    const node = lookup.get(s);
    if (node) out.push(node);
  }
  return out;
}

function toEnumValue(v: unknown): string | null {
  if (typeof v !== 'string' || v === '') return null;
  return v.toUpperCase().replace(/-/g, '_');
}

async function drawConnector(
  n: any,
  itemId: string,
  lookup: Map<string, SceneNode>,
): Promise<SceneNode[]> {
  const sources = resolveEndpoints(n.from, n.to, lookup);
  const targets = resolveEndpoints(n.to, n.from, lookup);
  if (sources.length === 0 || targets.length === 0) return [];
  const label = n.label != null ? String(n.label) : '';
  const lineType = toEnumValue(n.lineType);
  const fromCap = toEnumValue(n.fromCap);
  const toCap = toEnumValue(n.toCap);
  const created: SceneNode[] = [];
  for (const src of sources) {
    for (const tgt of targets) {
      if (src === tgt) continue;
      const c = figma.createConnector();
      // connectorLineType must be set before endpoints: straight
      // connectors reject magnet 'AUTO', only elbowed accepts it.
      if (lineType) c.connectorLineType = lineType as ConnectorNode['connectorLineType'];
      const magnet = c.connectorLineType === 'ELBOWED' ? 'AUTO' : 'CENTER';
      c.connectorStart = { endpointNodeId: src.id, magnet };
      c.connectorEnd = { endpointNodeId: tgt.id, magnet };
      if (label) {
        await figma.loadFontAsync(DEFAULT_FONT);
        c.text.characters = label;
        applyFontSize(c.text, n);
      }
      if (fromCap) c.connectorStartStrokeCap = fromCap as ConnectorNode['connectorStartStrokeCap'];
      if (toCap) c.connectorEndStrokeCap = toCap as ConnectorNode['connectorEndStrokeCap'];
      applyStroke(c as any, n);
      applyOpacity(c, n);
      tagNode(c, itemId);
      created.push(c);
    }
  }
  return created;
}

function boundsOf(nodes: SceneNode[]): { x: number; y: number; w: number; h: number } | null {
  if (nodes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const nx = 'x' in n ? n.x : 0;
    const ny = 'y' in n ? n.y : 0;
    const nw = 'width' in n ? n.width : 0;
    const nh = 'height' in n ? n.height : 0;
    if (nx < minX) minX = nx;
    if (ny < minY) minY = ny;
    if (nx + nw > maxX) maxX = nx + nw;
    if (ny + nh > maxY) maxY = ny + nh;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

async function renderNodeTree(
  n: any,
  itemId: string,
  lookup: Map<string, SceneNode>,
  connectors: any[],
): Promise<SceneNode | null> {
  if (!n || typeof n !== 'object') return null;
  if (n.type === 'connector') {
    connectors.push(n);
    return null;
  }

  if (n.type === 'section' && Array.isArray(n.nodes)) {
    // Render children first, then create the section sized to fit and
    // appendChild each — translating x/y into section-local coords.
    const children: SceneNode[] = [];
    for (const c of n.nodes) {
      const child = await renderNodeTree(c, itemId, lookup, connectors);
      if (child) children.push(child);
    }

    const section = figma.createSection();
    if (n.name) section.name = String(n.name);
    applyFill(section as any, n);
    applyOpacity(section, n);

    const sx = n.x != null ? Number(n.x) : 0;
    const sy = n.y != null ? Number(n.y) : 0;
    const b = boundsOf(children);
    const PAD = 24;
    const w = n.width != null
      ? Number(n.width)
      : (b ? b.w + 2 * PAD : section.width);
    const h = n.height != null
      ? Number(n.height)
      : (b ? b.h + 2 * PAD : section.height);
    section.x = sx;
    section.y = sy;
    section.resizeWithoutConstraints(w, h);

    // Center children within the section with uniform padding.
    let dx = 0, dy = 0;
    if (b) {
      const targetX = sx + (w - b.w) / 2;
      const targetY = sy + (h - b.h) / 2;
      dx = targetX - b.x;
      dy = targetY - b.y;
    }

    for (const c of children) {
      if (!('x' in c) || !('y' in c)) {
        section.appendChild(c);
        continue;
      }
      const absX = ((c as any).x as number) + dx;
      const absY = ((c as any).y as number) + dy;
      section.appendChild(c);
      (c as any).x = absX - sx;
      (c as any).y = absY - sy;
    }

    tagNode(section, itemId);
    return section;
  }

  const node = await drawNode(n, itemId);
  if (node) {
    const key = primaryKey(n);
    if (key != null && !lookup.has(key)) lookup.set(key, node);
  }
  return node;
}

async function drawBoard(data: any, itemId: string): Promise<number> {
  const created: SceneNode[] = [];
  const nodes = data.nodes || [];
  const lookup = new Map<string, SceneNode>();
  const connectors: any[] = [];

  for (const n of nodes) {
    const rendered = await renderNodeTree(n, itemId, lookup, connectors);
    if (rendered) created.push(rendered);
  }
  for (const n of connectors) {
    const made = await drawConnector(n, itemId, lookup);
    created.push(...made);
  }

  if (created.length > 0) {
    figma.viewport.scrollAndZoomIntoView(created);
  }

  return created.length;
}

// --- Renderer registry ---

type Renderer = (data: any, itemId: string) => Promise<number>;

function getRenderer(data: any): Renderer | null {
  if (data && data.type === 'board') {
    return drawBoard;
  }
  return null;
}

// --- Items persistence (per-file) ---

function loadItems(): { id: string; checked: boolean }[] {
  const raw = figma.root.getPluginData('items');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveItems(items: { id: string; checked: boolean }[]): void {
  figma.root.setPluginData('items', JSON.stringify(items));
}

// --- Plugin entry point ---

figma.showUI(__html__, { width: 320, height: 420 });

figma.clientStorage.getAsync('apiKey').then((apiKey) => {
  figma.ui.postMessage({
    type: 'init',
    apiKey: apiKey || '',
    items: loadItems(),
  });
});

figma.ui.onmessage = async (msg: any) => {
  if (msg.type === 'save-api-key') {
    if (msg.apiKey) { figma.clientStorage.setAsync('apiKey', msg.apiKey); }
  } else if (msg.type === 'clear-api-key') {
    figma.clientStorage.deleteAsync('apiKey');
  } else if (msg.type === 'save-items') {
    saveItems(msg.items || []);
  } else if (msg.type === 'remove-item-nodes') {
    removeNodesForItem(msg.itemId);
  } else if (msg.type === 'draw') {
    const renderer = getRenderer(msg.data);
    if (!renderer) {
      const keys = msg.data && typeof msg.data === 'object' ? Object.keys(msg.data).join(', ') : typeof msg.data;
      figma.ui.postMessage({
        type: 'error',
        message: 'No renderer for ' + msg.itemId + ' (got keys: ' + keys + ')',
      });
      return;
    }
    removeOrphans();
    removeNodesForItem(msg.itemId);
    const count = await renderer(msg.data, msg.itemId);
    figma.ui.postMessage({ type: 'draw-complete', itemId: msg.itemId, count });
  }
};
