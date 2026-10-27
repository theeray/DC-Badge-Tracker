import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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

test("the Figma typography video is accurately labeled and Illustrator gets its own spelling lesson", () => {
  const typography = findSkill("on-ai-spell");
  assert.match(typography.title, /typography.*figma/i);
  assert.doesNotMatch(typography.title, /spellcheck|spell.?check/i);
  assert.match(typography.href, /ns6orFTwDwE/);
  assert.equal(typography.area, "content-creation");
  assert.equal(typography.group, "Graphic Design");

  const spelling = findSkill("on-illustrator-spellcheck");
  assert.match(spelling.title, /illustrator/i);
  assert.match(spelling.title, /spell/i);
  assert.equal(new URL(spelling.href).hostname, "helpx.adobe.com");
  assert.match(new URL(spelling.href).pathname, /illustrator.*check-and-correct-spelling/);
  assert.notEqual(spelling.href, typography.href);
});

test("the requested obsolete or mislabeled catalog entries are removed without removing valid creative briefs", () => {
  for (const id of ["sm-brief", "sm-linktree", "sm-linktree-guide", "sm-login", "cc-character-animator", "on-checklist", "lead-checklist"]) {
    assert.ok(!allSkills.some((item) => item.id === id), `${id} should no longer appear in the catalog`);
  }
  for (const id of ["on-briefs", "on-make-brief", "sm-briefs", "sm-make-brief"]) {
    assert.match(findSkill(id).href, /2447654/);
  }
  const characters = findSkill("cc-characters");
  assert.match(characters.title, /adobe express/i);
  assert.doesNotMatch(characters.title, /character animator/i);
});

test("both learning paths offer the supplied pre-meeting and post-meeting project checklists", () => {
  const fixtures = [
    {
      suffix: "pre-meeting-checklist",
      href: "/resources/onboarding/digital-corps-pre-meeting-project-checklist.pdf",
      title: /Digital Corps Pre-Meeting Project Checklist/i,
      digest: "e6f652f0d3538c7054b44fa8fc0fb52d0291848d52eb4f9f5f24d1a2a1ce3846",
    },
    {
      suffix: "post-meeting-checklist",
      href: "/resources/onboarding/digital-corps-post-meeting-project-checklist.pdf",
      title: /Digital Corps Post-Meeting Project Checklist/i,
      digest: "f1e9e247d240985486be2c31277b88617247326b6cef701ed73542615d045305",
    },
  ];
  for (const fixture of fixtures) {
    for (const prefix of ["on", "lead"]) {
      const item = findSkill(`${prefix}-${fixture.suffix}`);
      assert.equal(item.href, fixture.href);
      assert.match(item.title, fixture.title);
    }
    const bytes = readFileSync(new URL(`../public${fixture.href}`, import.meta.url));
    assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(bytes.length > 1000);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), fixture.digest, "Supplied PDF bytes must remain unchanged");
  }
  assert.ok(!allSkills.some((item) => item.href === "/resources/onboarding/digital-corps-checklist.pdf"));
});

test("Logo Reveal separates assignment requirements from official technical tutorials", () => {
  const logo = findSkill("cc-logo-reveal");
  assert.equal(logo.href, "/resources/onboarding/logo-reveal-tutorial.pdf");
  assert.match(logo.resourceLabel, /assignment|brief|requirements/i);
  const additional = logo.additionalResources ?? [];
  assert.equal(additional.length, 2);
  assert.ok(additional.every((resource) => new URL(resource.href).hostname === "www.adobe.com"));
  assert.ok(additional.some((resource) => resource.href.endsWith("/animate-title-reveal")));
  assert.ok(additional.some((resource) => resource.href.endsWith("/logo-animation")));
});

test("previously broad or unlinked lessons now point to focused HTTPS instructional content", () => {
  const expectedHosts = {
    "on-grammar": "support.microsoft.com",
    "cc-gimbal": "repair.dji.com",
    "cc-broll": "www.adobe.com",
    "cc-sync": "helpx.adobe.com",
    "cc-vox-tutorial": "www.hollyland.com",
    "cc-express": "helpx.adobe.com",
    "lead-iorad": "www.iorad.com",
    "cc-motion-package-pr": "helpx.adobe.com",
  };
  for (const [id, host] of Object.entries(expectedHosts)) {
    const item = findSkill(id);
    const url = new URL(item.href);
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, host, id);
    assert.ok(url.pathname.length > 1, `${id} needs a lesson, not a domain landing page`);
  }
  assert.equal(findSkill("lead-iorad").href, "https://www.iorad.com/player/2275907/Make-an-iorad-Tutorial");
  assert.match(findSkill("cc-express").title, /animate a design/i);
  assert.match(findSkill("cc-sync").href, /synchronize-clips-in-the-timeline-panel/);
  assert.ok(getSkillResources(findSkill("cc-broll")).some((resource) => /shot-list/.test(resource.href)));
});

test("hardware examples do not claim unverified DC gimbal or microphone compatibility", () => {
  const gimbal = findSkill("cc-gimbal");
  assert.match(`${gimbal.title} ${gimbal.resourceLabel} ${gimbal.resourceNote}`, /RS\s?4/i);
  assert.match(gimbal.resourceNote, /confirm|check/i);
  assert.match(gimbal.resourceNote, /model/i);
  const vox = findSkill("cc-vox-tutorial");
  assert.match(vox.resourceNote, /general/i);
  assert.match(vox.resourceNote, /DC|Digital Corps/i);
  assert.ok(getSkillResources(vox).some((resource) => /2620488/.test(resource.href)), "Keep the existing DC microphone orientation alongside general interview technique");
});

test("the second Premiere packaging entry is an explicit shared lesson without resetting either existing ID", () => {
  const canonical = findSkill("cc-package-pr");
  const motion = findSkill("cc-motion-package-pr");
  assert.equal(canonical.href, motion.href);
  assert.equal(new URL(canonical.href).hostname, "helpx.adobe.com");
  assert.match(canonical.href, /copy-project/);
  assert.match(motion.resourceNote, /shared|same/i);
  assert.equal(canonical.area, "content-creation");
  assert.equal(motion.group, "Motion Graphics");
});
