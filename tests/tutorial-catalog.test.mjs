import assert from "node:assert/strict";
import test from "node:test";
import { allSkills, getSkillResources, learningAreas } from "../app/data.ts";

const findSkill = (id) => {
  const item = allSkills.find((candidate) => candidate.id === id);
  assert.ok(item, `Expected existing skill ${id}`);
  return item;
};

test("tutorial IDs stay unique and use their existing learning areas", () => {
  const areaIds = new Set(learningAreas.map((area) => area.id));
  assert.equal(new Set(allSkills.map((item) => item.id)).size, allSkills.length);
  for (const item of allSkills) assert.ok(areaIds.has(item.area));
});

test("handwriting animation is an After Effects motion graphics lesson with a direct link", () => {
  const item = findSkill("cc-ae-handwriting-matte");
  assert.equal(item.group, "Motion Graphics");
  assert.equal(item.title, "After Effects: Handwriting Animation with Matte Masking");
  assert.equal(item.href, "https://www.youtube.com/watch?v=o0-nyp4Q3hw");
  assert.ok(!item.href.includes("safelinks"));
});

test("headshots no longer opens product lighting while the lighting-studio lesson is preserved", () => {
  const headshots = findSkill("cc-headshots");
  const lighting = findSkill("cc-lighting");
  assert.notEqual(headshots.href, lighting.href);
  assert.match(headshots.href, /alphauniverse\.com/);
  assert.match(lighting.href, /2455074\/Light-an-Object/);
  assert.match(findSkill("cc-camera").href, /ilce7m4\/en\/03\.php/);
});

test("gimbal camera connection uses official DJI resources instead of the unavailable video", () => {
  const pairing = findSkill("cc-gimbal-pair");
  const resources = getSkillResources(pairing);
  assert.equal(resources.length, 2);
  assert.ok(resources.every((resource) => ["cdn.djivideos.com", "www.dji.com"].includes(new URL(resource.href).hostname)));
  assert.ok(resources.every((resource) => !resource.href.includes("wrmBX8E4Mv8")));
  assert.match(pairing.resourceNote, /check the label/i);
});

test("an orientation document can be a second resource on the same badge without another skill ID", () => {
  const headshots = findSkill("cc-headshots");
  const withDocument = {
    ...headshots,
    additionalResources: [{ label: "Camera orientation document", href: "/test-orientation.docx" }],
  };
  const resources = getSkillResources(withDocument);
  assert.equal(withDocument.id, headshots.id);
  assert.equal(resources.length, 2);
  assert.equal(resources[0].href, headshots.href);
  assert.equal(resources[1].label, "Camera orientation document");
});

test("existing tutorial and Teams link labels remain available", () => {
  assert.equal(getSkillResources(findSkill("on-payroll"))[0].label, "Open tutorial");
  assert.equal(getSkillResources(findSkill("on-brand"))[0].label, "Open Teams resource");
  assert.deepEqual(getSkillResources({ id: "practice", title: "Practice", group: "Practice", area: "onboarding" }), []);
});
