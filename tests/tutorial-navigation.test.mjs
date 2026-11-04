import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { learningAreas } from "../app/data.ts";

const tracker = ts.createSourceFile(
  "tracker.tsx",
  readFileSync(new URL("../app/tracker.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function nodesMatching(root, predicate) {
  const found = [];
  const visit = (node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function variableInitializer(name) {
  const declarations = nodesMatching(
    tracker,
    (node) => ts.isVariableDeclaration(node) && node.name.getText(tracker) === name,
  );
  assert.equal(declarations.length, 1, `Expected one ${name} declaration`);
  assert.ok(declarations[0].initializer);
  return declarations[0].initializer;
}

function attribute(openingElement, name) {
  return openingElement.attributes.properties.find(
    (item) => ts.isJsxAttribute(item) && item.name.getText(tracker) === name,
  )?.initializer;
}

function expressionText(initializer) {
  assert.ok(initializer && ts.isJsxExpression(initializer));
  assert.ok(initializer.expression);
  return initializer.expression.getText(tracker);
}

function categorySelect() {
  const selects = nodesMatching(
    tracker,
    (node) => ts.isJsxOpeningElement(node)
      && node.tagName.getText(tracker) === "select"
      && attribute(node, "aria-label")?.text === "Filter tutorials by skill category",
  );
  assert.equal(selects.length, 1, "Expose one labeled native category select");
  return selects[0];
}

// Execute the small, pure expressions used by the actual UI rather than
// maintaining a second implementation of its category choices or filtering.
const groupsForArea = new Function(
  "activeArea",
  `return (${variableInitializer("activeGroups").getText(tracker)});`,
);
const matchesGroup = new Function(
  "searchingAllPaths",
  "selectedGroup",
  "item",
  `return (${variableInitializer("matchesGroup").getText(tracker)});`,
);

test("skill categories use a native select bound to the existing category state", () => {
  const select = categorySelect();
  assert.equal(expressionText(attribute(select, "value")), "selectedGroup");
  assert.match(expressionText(attribute(select, "onChange")), /setSelectedGroup\(event\.target\.value\)/);

  const options = nodesMatching(select.parent, (node) => ts.isJsxOpeningElement(node)
    && node.tagName.getText(tracker) === "option");
  assert.equal(options.length, 1, "One option template renders every derived category");
  assert.equal(expressionText(attribute(options[0], "value")), "group");
  assert.ok(nodesMatching(select.parent, (node) => ts.isCallExpression(node)
    && node.expression.getText(tracker) === "activeGroups.map").length === 1);

  assert.equal(nodesMatching(tracker, (node) => ts.isJsxAttribute(node)
    && node.name.getText(tracker) === "role"
    && node.initializer?.text === "tablist").length, 0,
  "Do not reintroduce horizontally hidden category tabs");
});

test("every learning-path category appears once and can reveal all of its tutorials", () => {
  assert.deepEqual(groupsForArea(undefined), []);
  for (const area of learningAreas) {
    const groups = groupsForArea(area);
    assert.deepEqual(groups, ["All skills", ...new Set(area.skills.map((item) => item.group))]);
    assert.equal(new Set(groups).size, groups.length);
    assert.deepEqual(area.skills.filter((item) => matchesGroup(false, "All skills", item)), area.skills);
    for (const group of groups.slice(1)) {
      const expected = area.skills.filter((item) => item.group === group);
      assert.ok(expected.length > 0, `${area.name}: ${group} must have a lesson`);
      assert.deepEqual(area.skills.filter((item) => matchesGroup(false, group, item)), expected);
    }
  }
});

test("Motion Graphics and Fabrication remain reachable after the early content categories", () => {
  const content = learningAreas.find((area) => area.id === "content-creation");
  assert.ok(content);
  const groups = groupsForArea(content);
  assert.ok(groups.includes("Motion Graphics"));
  assert.ok(groups.includes("Fabrication"));
  const motion = content.skills.filter((item) => matchesGroup(false, "Motion Graphics", item));
  assert.ok(motion.some((item) => item.id === "cc-ae-handwriting-matte"),
    "The existing handwriting lesson remains reachable without a new skill ID");
  assert.ok(content.skills.filter((item) => matchesGroup(false, "Fabrication", item)).length > 0);
});

test("global search explains why category selection is temporarily unavailable", () => {
  const select = categorySelect();
  assert.equal(expressionText(attribute(select, "disabled")), "Boolean(query.trim())");
  assert.match(expressionText(attribute(select, "aria-describedby")), /tutorial-search-scope/);
  assert.ok(nodesMatching(tracker, (node) => ts.isJsxAttribute(node)
    && node.name.getText(tracker) === "id"
    && node.initializer?.text === "tutorial-search-scope").length === 1);
  for (const area of learningAreas) {
    assert.deepEqual(area.skills.filter((item) => matchesGroup(true, "Motion Graphics", item)), area.skills);
  }
});

test("switching learning paths restores All skills rather than retaining an invalid category", () => {
  const switchView = variableInitializer("setActiveView");
  assert.ok(nodesMatching(switchView, (node) => ts.isCallExpression(node)
    && node.expression.getText(tracker) === "setSelectedGroup"
    && node.arguments[0]?.text === "All skills").length === 1);
});
