// Positioned boards (L0187). Fixtures are compiled L0187 programs (graffiticode
// languages/l0187/crates/core/tests/programs), without their reports; see test/fixtures/README.md.
import assert from "node:assert/strict";
import { test } from "node:test";
import { byNodeId, drawn, fixture, loadPlugin } from "./figma-mock.mjs";

const legsOf = (page, item, id) => byNodeId(page, item, id, "CONNECTOR");
const connectors = (data) => data.pages.flatMap((p) => p.nodes).filter((n) => n.type === "connector");
const errors = (messages) => messages.filter((m) => m.type === "error").map((m) => m.message);

test("a connector ends at the mark with its id, never a section with that name", async () => {
  const { figma, messages, send } = loadPlugin();
  await send({ type: "draw", itemId: "x", data: fixture("name-collision") });
  assert.deepEqual(errors(messages), []);
  const page = figma.currentPage;
  const [task] = byNodeId(page, "x", "task", "SHAPE_WITH_TEXT");
  const [section] = drawn(page, "x", "SECTION");
  assert.equal(section.name, "task");
  const legs = legsOf(page, "x", "intro-task");
  assert.equal(legs.at(-1).connectorEnd.endpointNodeId, task.id);
  for (const leg of legs) {
    for (const end of [leg.connectorStart, leg.connectorEnd]) assert.notEqual(end.endpointNodeId, section.id);
  }
});

test("an unknown endpoint id is an error, and nothing of the board is left drawn", async () => {
  const { figma, messages, send } = loadPlugin();
  const data = fixture("name-collision");
  connectors(data).find((c) => c.id === "intro-task").to = "missing";
  await send({ type: "draw", itemId: "x", data });
  assert.match(errors(messages)[0], /Connector "intro-task" to "missing"/);
  assert.equal(drawn(figma.currentPage, "x").length, 0);
});

test("a positioned section keeps its compiled box and its members their absolute places", async () => {
  const { figma, send } = loadPlugin();
  const data = fixture("name-collision");
  await send({ type: "draw", itemId: "x", data });
  const spec = data.pages[0].nodes.find((n) => n.type === "section");
  const [section] = drawn(figma.currentPage, "x", "SECTION");
  assert.deepEqual([section.x, section.y, section.width, section.height], [spec.x, spec.y, spec.width, spec.height]);
  const [intro] = byNodeId(figma.currentPage, "x", "intro", "STICKY");
  assert.equal(intro.parent, section);
  const box = intro.absoluteBoundingBox;
  assert.deepEqual([box.x, box.y], [spec.nodes[0].x, spec.nodes[0].y]);
});

test("a self-loop is drawn as its waypoint legs, labelled once, capped at its outer ends", async () => {
  const { figma, send } = loadPlugin();
  const data = fixture("name-collision");
  await send({ type: "draw", itemId: "x", data });
  const spec = connectors(data).find((c) => c.id === "task-loop");
  const [task] = byNodeId(figma.currentPage, "x", "task", "SHAPE_WITH_TEXT");
  const legs = legsOf(figma.currentPage, "x", "task-loop");
  assert.equal(legs.length, spec.waypoints.length + 1);
  assert.equal(legs[0].connectorStart.endpointNodeId, task.id);
  assert.equal(legs[0].connectorStart.magnet, spec.fromSide);
  assert.equal(legs.at(-1).connectorEnd.endpointNodeId, task.id);
  assert.equal(legs.at(-1).connectorEnd.magnet, spec.toSide);
  assert.equal(legs[0].connectorStartStrokeCap, "CIRCLE_FILLED");
  assert.equal(legs.at(-1).connectorEndStrokeCap, "TRIANGLE_FILLED");
  for (const leg of legs.slice(1)) assert.equal(leg.connectorStartStrokeCap, "NONE");
  for (const leg of legs.slice(0, -1)) assert.equal(leg.connectorEndStrokeCap, "NONE");
  // The plugin labels the leg the compiler modeled the label box on.
  assert.deepEqual(legs.map((l) => l.text.characters), legs.map((_, i) => (i === spec.labelLeg ? "retry" : "")));
  assert.ok(legs.every((l) => l.connectorLineType === "STRAIGHT"));
});

for (const name of ["self-loop-parallel", "parallel-three"]) {
  test(`parallel connectors are each labelled on their own leg (${name})`, async () => {
    const { figma, messages, send } = loadPlugin();
    const data = fixture(name);
    await send({ type: "draw", itemId: "x", data });
    assert.deepEqual(errors(messages), []);
    const mids = new Set();
    for (const spec of connectors(data)) {
      const legs = legsOf(figma.currentPage, "x", spec.id);
      const labelled = legs.filter((l) => l.text.characters !== "");
      assert.equal(labelled.length, 1, spec.id);
      assert.equal(labelled[0].text.characters, spec.label);
      assert.equal(legs.indexOf(labelled[0]), spec.labelLeg, spec.id);
      const ends = [labelled[0].connectorStart, labelled[0].connectorEnd].map((e) => e.position ?? e.magnet);
      mids.add(JSON.stringify(ends));
    }
    assert.equal(mids.size, connectors(data).length, "every label on a distinct leg");
  });
}

test("text keeps its compiled width, stickies their width", async () => {
  const { figma, send } = loadPlugin();
  const data = fixture("duplicate-page-names");
  await send({ type: "draw", itemId: "x", data });
  await send({ type: "bind-page", itemId: "x", pageId: "week-2" });
  const spec = data.pages[1].nodes.find((n) => n.id === "caption");
  const [caption] = byNodeId(figma.currentPage, "x", "caption", "TEXT");
  assert.equal(caption.width, spec.width);
  assert.equal(caption.textAutoResize, "HEIGHT");
  const [second] = byNodeId(figma.currentPage, "x", "second", "STICKY");
  assert.equal(second.isWideWidth, false);
});

test("two board pages with the same name are drawn into their own FigJam pages by id", async () => {
  const { figma, messages, pages, send } = loadPlugin({ pages: ["Notes", "Notes"] });
  const data = fixture("duplicate-page-names");
  await send({ type: "draw", itemId: "x", data });
  assert.equal(byNodeId(pages[0], "x", "first").length, 1);
  // Messages come from the plugin's realm (vm), so compare them as JSON.
  assert.deepEqual(JSON.parse(JSON.stringify(messages.find((m) => m.type === "pages"))), {
    type: "pages",
    itemId: "x",
    pages: [{ id: "week-1", name: "Notes" }, { id: "week-2", name: "Notes" }],
    selected: "week-1",
  });
  figma.currentPage = pages[1];
  assert.equal(messages.at(-1).selected, "week-1", "an unbound page shows the default");
  await send({ type: "bind-page", itemId: "x", pageId: "week-2" });
  assert.equal(byNodeId(pages[1], "x", "second").length, 1);
  assert.equal(byNodeId(pages[1], "x", "first").length, 0);
  assert.equal(byNodeId(pages[0], "x", "first").length, 1, "the other FigJam page is untouched");
  assert.deepEqual(JSON.parse(pages[0].getPluginData("gc-page-ids")), { x: "week-1" });
  assert.deepEqual(JSON.parse(pages[1].getPluginData("gc-page-ids")), { x: "week-2" });
  // A redraw (the board changed) keeps each FigJam page's own page.
  await send({ type: "draw", itemId: "x", data });
  assert.equal(byNodeId(pages[1], "x", "second").length, 1);
  figma.currentPage = pages[0];
  assert.equal(messages.at(-1).selected, "week-1");
});

test("two watched boards on one FigJam page keep their own page selections", async () => {
  const { figma, send } = loadPlugin();
  const data = fixture("duplicate-page-names");
  await send({ type: "draw", itemId: "x", data });
  await send({ type: "draw", itemId: "y", data });
  await send({ type: "bind-page", itemId: "x", pageId: "week-2" });
  const page = figma.currentPage;
  assert.deepEqual(JSON.parse(page.getPluginData("gc-page-ids")), { x: "week-2", y: "week-1" });
  await send({ type: "draw", itemId: "x", data });
  await send({ type: "draw", itemId: "y", data });
  assert.equal(byNodeId(page, "x", "second").length, 1);
  assert.equal(byNodeId(page, "y", "first").length, 1);
  assert.equal(byNodeId(page, "y", "second").length, 0);
});

test("a binding to a page the board no longer has is reported and dropped, not redirected", async () => {
  const { figma, messages, send } = loadPlugin();
  const data = fixture("duplicate-page-names");
  await send({ type: "draw", itemId: "x", data });
  await send({ type: "bind-page", itemId: "x", pageId: "week-2" });
  const page = figma.currentPage;
  const before = drawn(page, "x").map((n) => n.id);
  const changed = { ...data, pages: [data.pages[0]] };
  await send({ type: "draw", itemId: "x", data: changed });
  assert.match(errors(messages).at(-1), /board page "week-2" of x, which the board no longer has/);
  assert.deepEqual(drawn(page, "x").map((n) => n.id), before, "the drawing is left as it was");
  assert.deepEqual(JSON.parse(page.getPluginData("gc-page-ids")), {});
  // Single-page boards need no picker; drawing again uses the board's page.
  await send({ type: "draw", itemId: "x", data: changed });
  assert.equal(byNodeId(page, "x", "first").length, 1);
});

test("an L0186 board is unchanged: pages by name, endpoints by text, self-loops skipped", async () => {
  const { figma, messages, send } = loadPlugin({ pages: ["Retro"] });
  const data = {
    type: "board",
    pages: [
      { name: "Planning", nodes: [{ type: "sticky", text: "P" }] },
      {
        name: "Retro",
        nodes: [
          { type: "section", name: "Went well", nodes: [{ type: "sticky", text: "Ship" }] },
          { type: "shape", text: "Next" },
          { type: "connector", from: "Ship", to: "Next" },
          { type: "connector", from: "Next", to: "Next" },
          { type: "connector", from: "Went well", to: "Next" },
        ],
      },
    ],
  };
  await send({ type: "draw", itemId: "z", data });
  assert.deepEqual(errors(messages), []);
  assert.equal(drawn(figma.currentPage, "z", "STICKY")[0].text.characters, "Ship");
  assert.equal(drawn(figma.currentPage, "z", "CONNECTOR").length, 2);
  assert.equal(figma.currentPage.getPluginData("gc-page-ids"), "");
  assert.match(messages.at(-1).note, /"Planning"/);
});
