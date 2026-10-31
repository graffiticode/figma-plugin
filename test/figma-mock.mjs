// A small in-memory model of the FigJam plugin API, enough to run dist/code.js under node:test.
// It models what the plugin reads back (ids, boxes, parents, plugin data, connector ends), not
// FigJam's rendering.
import { readFileSync } from "node:fs";
import vm from "node:vm";

let nextId = 1;

class Node {
  constructor(type, figma) {
    this.id = `${nextId++}:1`;
    this.type = type;
    this.name = "";
    this.x = 0;
    this.y = 0;
    this.width = 100;
    this.height = 100;
    this.parent = null;
    this.removed = false;
    this.opacity = 1;
    this.fills = [];
    this.strokes = [];
    this.strokeWeight = 1;
    this.dashPattern = [];
    this.pluginData = {};
    if (figma) figma.currentPage.appendChild(this);
  }
  setPluginData(k, v) { this.pluginData[k] = v; }
  getPluginData(k) { return this.pluginData[k] ?? ""; }
  resize(w, h) { this.width = w; this.height = h; }
  resizeWithoutConstraints(w, h) { this.width = w; this.height = h; }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
    for (const c of this.children ?? []) c.remove();
    this.removed = true;
  }
  get absoluteBoundingBox() {
    let { x, y } = this;
    for (let p = this.parent; p && p.type !== "PAGE"; p = p.parent) { x += p.x; y += p.y; }
    return { x, y, width: this.width, height: this.height };
  }
}

const container = {
  appendChild(c) {
    if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
    c.parent = this;
    this.children.push(c);
  },
  findAll(pred) {
    const out = [];
    const walk = (n) => {
      for (const c of n.children ?? []) {
        if (pred(c)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  },
};

class Page extends Node {
  constructor(name) {
    super("PAGE");
    this.name = name;
    this.children = [];
    this.backgrounds = [];
  }
}
Object.assign(Page.prototype, container);

class Text {
  constructor() { this.characters = ""; this.fontSize = 16; }
}

export function createFigma({ pages = ["Page 1"] } = {}) {
  const messages = [];
  const handlers = {};
  const pageNodes = pages.map((name) => new Page(name));
  let current = pageNodes[0];
  const root = new Node("DOCUMENT");
  root.children = pageNodes;
  const figma = {
    mixed: Symbol("mixed"),
    fileKey: undefined,
    root,
    get currentPage() { return current; },
    set currentPage(p) { current = p; (handlers.currentpagechange ?? []).forEach((f) => f()); },
    showUI() {},
    on(event, fn) { (handlers[event] ??= []).push(fn); },
    ui: { onmessage: null, postMessage: (m) => messages.push(m) },
    clientStorage: { getAsync: async () => "", setAsync: async () => {}, deleteAsync: async () => {} },
    viewport: { scrollAndZoomIntoView() {} },
    loadFontAsync: async () => {},
    createShapeWithText() {
      const n = new Node("SHAPE_WITH_TEXT", figma);
      n.shapeType = "SQUARE";
      n.text = new Text();
      return n;
    },
    createSticky() {
      const n = new Node("STICKY", figma);
      n.width = n.height = 240;
      n.text = new Text();
      let wide = false;
      Object.defineProperty(n, "isWideWidth", {
        get: () => wide,
        set: (v) => { wide = v; n.width = v ? 416 : 240; },
      });
      return n;
    },
    createText() {
      const n = new Node("TEXT", figma);
      n.characters = "";
      n.fontSize = 16;
      n.textAutoResize = "WIDTH_AND_HEIGHT";
      return n;
    },
    createSection() {
      const n = new Node("SECTION", figma);
      n.children = [];
      Object.assign(n, container);
      return n;
    },
    createConnector() {
      const n = new Node("CONNECTOR", figma);
      n.connectorLineType = "ELBOWED";
      n.connectorStartStrokeCap = "NONE";
      n.connectorEndStrokeCap = "ARROW_LINES";
      n.text = new Text();
      return n;
    },
    createVector() { return new Node("VECTOR", figma); },
    createEllipse() { return new Node("ELLIPSE", figma); },
    group(nodes, parent) {
      const g = new Node("GROUP");
      g.children = [];
      Object.assign(g, container);
      parent.appendChild(g);
      for (const n of nodes) g.appendChild(n);
      return g;
    },
  };
  return { figma, messages, pages: pageNodes };
}

/** Runs the built plugin against a fresh mock; `send` delivers one UI message and waits for it. */
export function loadPlugin(options) {
  const env = createFigma(options);
  const code = readFileSync(new URL("../dist/code.js", import.meta.url), "utf-8");
  vm.runInNewContext(code, { figma: env.figma, __html__: "", console });
  const send = (msg) => env.figma.ui.onmessage(msg);
  return { ...env, send };
}

/** The nodes an item drew on a page, by type. */
export function drawn(page, itemId, type) {
  return page.findAll((n) => n.getPluginData("itemId") === itemId && (!type || n.type === type));
}

export function byNodeId(page, itemId, id, type) {
  return drawn(page, itemId, type).filter((n) => n.getPluginData("nodeId") === id);
}

export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf-8"));
}
