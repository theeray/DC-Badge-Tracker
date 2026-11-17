import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as content from "../app/content-catalog.ts";
import { getSkillResources, learningAreas, projectBriefs } from "../app/data.ts";
import { defaultContentResources } from "../app/content-defaults.ts";

const baseline = { learningAreas, projectBriefs, resources: defaultContentResources };
const tutorial = (overrides = {}) => content.canonicalizeManagedContentData("tutorial", "sample-skill", {
  id: "sample-skill", title: "Sample skill", group: "Graphic Design", area: "content-creation", href: "https://example.com/tutorial", ...overrides,
});
const managed = (kind, key, data, overrides = {}) => ({
  kind, key, data, archived: false, revision: 1, createdBy: "director", createdAt: null, updatedBy: "director", updatedAt: null, ...overrides,
});

test("all bundled content canonicalizes without changing stable IDs or original source objects", () => {
  const before = JSON.stringify(baseline);
  const merged = content.mergeManagedCatalog(baseline, []);
  assert.equal(merged.allSkills.length, learningAreas.flatMap((area) => area.skills).length);
  assert.deepEqual(merged.allSkills.map((skill) => skill.id), learningAreas.flatMap((area) => area.skills.map((skill) => skill.id)));
  assert.equal(merged.projectBriefs.length, projectBriefs.length);
  assert.equal(merged.resources.length, defaultContentResources.length);
  assert.equal(JSON.stringify(baseline), before);
  for (const project of merged.projectBriefs) {
    assert.equal(typeof project.assetHref, "string");
    assert.ok(Array.isArray(project.evaluation));
    assert.ok(Array.isArray(project.assets));
  }
});

test("tutorial optional fields become a complete canonical schema with no suggested badge by default", () => {
  const item = tutorial({ title: "  A clearer title  " });
  assert.equal(item.title, "A clearer title");
  assert.deepEqual(Object.keys(item).sort(), ["id", "title", "group", "area", "href", "resourceLabel", "resourceNote", "additionalResources", "internal", "searchTerms", "tier"].sort());
  assert.equal(item.tier, "");
  assert.equal(item.internal, false);
  assert.deepEqual(item.additionalResources, []);
  assert.deepEqual(item.searchTerms, []);
});

test("displayed tutorial links retain default labels after canonical stored defaults are merged", () => {
  const merged = content.mergeManagedCatalog(baseline, []);
  assert.equal(getSkillResources(merged.allSkills.find((skill) => skill.id === "on-payroll"))[0].label, "Open tutorial");
  assert.equal(getSkillResources(merged.allSkills.find((skill) => skill.id === "on-brand"))[0].label, "Open Teams resource");
  const skill = tutorial({ resourceLabel: "" });
  const edited = content.mergeManagedCatalog(baseline, [managed("tutorial", skill.id, skill)]);
  assert.equal(getSkillResources(edited.allSkills.find((item) => item.id === skill.id))[0].label, "Open tutorial");
});

test("stable IDs must match the document key and use a bounded safe slug", () => {
  for (const key of ["", "../skill", "skill/child", "Capital", "skill--two", "-skill", "skill-", "x".repeat(81)]) {
    assert.throws(() => content.canonicalizeManagedContentData("tutorial", key, { ...tutorial(), id: key }));
  }
  assert.throws(() => content.canonicalizeManagedContentData("tutorial", "sample-skill", { ...tutorial(), id: "changed" }), /ID/i);
  assert.equal(content.managedContentDocumentId("tutorial", "sample-skill"), "tutorial--sample-skill");
});

test("learning path IDs cannot collide with site navigation while other entity IDs stay independent", () => {
  const expected = ["admin", "brand-guides", "content-editor", "dc-meet", "knowledge-checks", "member-development", "new-hire-onboarding", "overview", "projects", "skills-dashboard", "time-clock"];
  assert.deepEqual([...content.reservedAreaIds].sort(), [...expected].sort());
  for (const id of expected) {
    assert.throws(() => content.canonicalizeManagedContentData("area", id, { id, name: "Reserved", shortName: "Reserved", eyebrow: "", description: "" }), /reserved.*navigation/i);
    assert.equal(content.canonicalizeManagedContentData("tutorial", id, { ...tutorial(), id }).id, id);
  }
  assert.equal(content.canonicalizeManagedContentData("area", "new-learning-path", { id: "new-learning-path", name: "New path", shortName: "New", eyebrow: "", description: "" }).id, "new-learning-path");
});

test("links permit HTTPS and root-relative paths but reject unsafe protocols and origins", () => {
  assert.equal(tutorial({ href: "HTTPS://example.com/lesson" }).href, "https://example.com/lesson");
  for (const href of ["https://example.com/lesson?q=1#step-2", "/resources/guide.pdf", ""]) assert.equal(content.isSafeContentHref(href, true), true, href);
  for (const href of ["//evil.example.com", "http://example.com", "javascript:alert(1)", "data:text/html,test", "mailto:student@example.com", "https://user:pass@example.com", "/\\evil.example", "https://example.com/one\ntwo", "/path with spaces", "https://", "https://example.com/" + "x".repeat(1000)]) {
    assert.equal(content.isSafeContentHref(href), false, href);
    assert.throws(() => tutorial({ href }), /link|path/i);
  }
});

test("nested resources, list bounds, required fields and supported tiers are validated", () => {
  for (const overrides of [
    { title: "" }, { group: "" }, { area: "not/valid" }, { title: "x".repeat(161) }, { resourceNote: "x".repeat(1601) },
    { tier: "Platinum" }, { internal: "true" }, { unknownField: true }, { searchTerms: Array(13).fill("term") },
    { searchTerms: [""] }, { additionalResources: Array(7).fill({ label: "Link", href: "/safe" }) },
    { additionalResources: [{ label: "", href: "/safe" }] }, { additionalResources: [{ label: "Link", href: "javascript:x" }] },
    { additionalResources: [{ label: "Link", href: "/safe", unexpected: true }] },
  ]) assert.throws(() => tutorial(overrides), JSON.stringify(overrides));
  const item = tutorial({ tier: "Gold", additionalResources: [{ label: " Guide ", href: "/guide.pdf" }], searchTerms: [" Adobe "] });
  assert.equal(item.tier, "Gold");
  assert.deepEqual(item.additionalResources, [{ label: "Guide", href: "/guide.pdf" }]);
  assert.deepEqual(item.searchTerms, ["Adobe"]);
});

test("text lists reject NUL sentinels without rejecting normal multi-line instructions", () => {
  assert.throws(() => tutorial({ searchTerms: ["bad\u0000term"] }), /NUL/);
  const project = projectBriefs[0];
  for (const field of ["deliverables", "workflow", "constraints", "evaluation", "assets"]) {
    assert.throws(() => content.canonicalizeManagedContentData("project", project.id, { ...project, [field]: ["bad\u0000entry"] }), /NUL/);
  }
  const saved = content.canonicalizeManagedContentData("project", project.id, { ...project, workflow: ["First line\nSecond line"] });
  assert.deepEqual(saved.workflow, ["First line\nSecond line"]);
});

test("area metadata omits nested tutorials; resources stay in an approved collection", () => {
  const area = content.canonicalizeManagedContentData("area", learningAreas[0].id, learningAreas[0]);
  assert.ok(!("skills" in area));
  assert.throws(() => content.canonicalizeManagedContentData("area", area.id, { ...area, shortName: "x".repeat(81) }));
  const resource = { id: "sample-resource", section: "onboarding", title: "Guide", description: "", href: "/guide.pdf", format: "PDF", kind: "Guide" };
  assert.deepEqual(content.canonicalizeManagedContentData("resource", resource.id, resource), resource);
  assert.throws(() => content.canonicalizeManagedContentData("resource", resource.id, { ...resource, section: "outside" }));
});

test("project asset files preserve the orchestra pack and reject traversal or dangerous URLs", () => {
  const orchestra = projectBriefs.find((project) => project.id === "orchestra-campaign");
  assert.ok(orchestra);
  const item = content.canonicalizeManagedContentData("project", orchestra.id, orchestra);
  assert.deepEqual(item.assets, orchestra.assets);
  for (const asset of ["_MG_5086-14.jpg", "/assets/orchestra/photo.jpg", "https://example.com/photo.jpg"]) assert.equal(content.isSafeProjectAsset(asset), true);
  for (const asset of ["../secret", "folder/photo.jpg", "photo..jpg", "\\evil", "//evil", "javascript:x", "bad\nphoto.jpg"]) {
    assert.equal(content.isSafeProjectAsset(asset), false, asset);
    assert.throws(() => content.canonicalizeManagedContentData("project", orchestra.id, { ...orchestra, assets: [asset] }));
  }
  assert.throws(() => content.canonicalizeManagedContentData("project", orchestra.id, { ...orchestra, workflow: Array(13).fill("step") }));
});

test("managed edits overlay by ID without duplicates and move tutorials between areas", () => {
  const original = learningAreas[0].skills[0];
  const edited = content.canonicalizeManagedContentData("tutorial", original.id, { ...original, title: "Updated lesson", area: "content-creation" });
  const merged = content.mergeManagedCatalog(baseline, [managed("tutorial", original.id, edited)]);
  assert.equal(merged.allSkills.length, learningAreas.flatMap((area) => area.skills).length);
  assert.equal(merged.allSkills.filter((skill) => skill.id === original.id).length, 1);
  assert.equal(merged.allSkills.find((skill) => skill.id === original.id).title, "Updated lesson");
  assert.ok(!merged.learningAreas[0].skills.some((skill) => skill.id === original.id));
  assert.ok(merged.learningAreas.find((area) => area.id === "content-creation").skills.some((skill) => skill.id === original.id));
});

test("new areas and tutorials appear together while unassigned tutorials stay available for historical lookup", () => {
  const area = { id: "new-area", name: "New area", shortName: "New", eyebrow: "Learn", description: "" };
  const added = tutorial({ area: area.id });
  const merged = content.mergeManagedCatalog(baseline, [managed("area", area.id, area), managed("tutorial", added.id, added)]);
  assert.ok(merged.learningAreas.find((item) => item.id === area.id).skills.some((skill) => skill.id === added.id));
  const unassigned = content.mergeManagedCatalog(baseline, [managed("tutorial", added.id, added)]);
  assert.ok(unassigned.allSkillsIncludingArchived.some((skill) => skill.id === added.id));
  assert.ok(!unassigned.allSkills.some((skill) => skill.id === added.id));
});

test("archive hides content but preserves stable historical lookup and restores without touching progress", () => {
  const original = learningAreas[0].skills[0];
  const entry = managed("tutorial", original.id, content.canonicalizeManagedContentData("tutorial", original.id, original), { archived: true });
  const progress = { [original.id]: "complete" };
  const archived = content.mergeManagedCatalog(baseline, [entry]);
  assert.ok(!archived.allSkills.some((skill) => skill.id === original.id));
  assert.ok(archived.allSkillsIncludingArchived.some((skill) => skill.id === original.id));
  assert.equal(progress[original.id], "complete");
  const restored = content.mergeManagedCatalog(baseline, [{ ...entry, archived: false, revision: 2 }]);
  assert.ok(restored.allSkills.some((skill) => skill.id === original.id));
  assert.deepEqual(progress, { [original.id]: "complete" });
});

test("archived areas hide their learning list but keep every tutorial for historical records", () => {
  const area = learningAreas[0];
  const merged = content.mergeManagedCatalog(baseline, [managed("area", area.id, content.canonicalizeManagedContentData("area", area.id, area), { archived: true })]);
  assert.ok(!merged.learningAreas.some((item) => item.id === area.id));
  assert.ok(!merged.allSkills.some((skill) => skill.area === area.id));
  assert.equal(merged.allSkillsIncludingArchived.filter((skill) => skill.area === area.id).length, area.skills.length);
  assert.ok(merged.allAreasIncludingArchived.some((item) => item.id === area.id));
});

test("projects and resource archives remain editable and do not remove baseline source assets", () => {
  const project = projectBriefs[0];
  const resource = defaultContentResources[0];
  const merged = content.mergeManagedCatalog(baseline, [
    managed("project", project.id, content.canonicalizeManagedContentData("project", project.id, project), { archived: true }),
    managed("resource", resource.id, resource, { archived: true }),
  ]);
  assert.ok(!merged.projectBriefs.some((item) => item.id === project.id));
  assert.ok(merged.allProjectsIncludingArchived.some((item) => item.id === project.id));
  assert.ok(!merged.resources.some((item) => item.id === resource.id));
  assert.ok(merged.allResourcesIncludingArchived.some((item) => item.id === resource.id));
  assert.equal(projectBriefs[0], project);
  assert.equal(defaultContentResources[0], resource);
});

function mockedContentFirebase() {
  const profile = { uid: "director", email: "director@example.org", displayName: "Director", role: "director", active: true };
  const auth = { currentUser: { uid: profile.uid, emailVerified: true } };
  const timestamp = { toDate: () => new Date("2026-11-17T12:00:00Z") };
  const state = { documents: new Map(), writes: [], reads: [], listeners: [], transactions: 0, failCommit: false };
  let transactionQueue = Promise.resolve();
  const firestoreSdk = {
    collection: (_db, ...segments) => segments.join("/"),
    doc: (_db, ...segments) => segments.join("/"),
    serverTimestamp: () => timestamp,
    onSnapshot: (path, callback, onError) => {
      const listener = { path, callback, onError, active: true };
      state.listeners.push(listener);
      const docs = [...state.documents].filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"))
        .map(([key, data]) => ({ id: key.split("/").at(-1), data: () => data }));
      callback({ docs });
      return () => { listener.active = false; };
    },
    runTransaction: (_db, operation) => {
      const task = transactionQueue.then(async () => {
        state.transactions += 1;
        const pending = [];
        const result = await operation({
          get: async (path) => { state.reads.push(path); const data = state.documents.get(path); return { exists: () => data !== undefined, data: () => data }; },
          set: (path, data) => { pending.push({ path, data }); },
        });
        if (state.failCommit) throw new Error("commit failed");
        for (const { path, data } of pending) state.documents.set(path, data);
        state.writes.push(...pending);
        return result;
      });
      transactionQueue = task.catch(() => undefined);
      return task;
    },
  };
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL("../app/content-firebase.ts", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, {
    exports: module.exports, module, Date,
    require: (name) => {
      if (name === "firebase/firestore") return firestoreSdk;
      if (name === "./firebase") return { auth, db: {}, readableFirebaseError: (error) => error?.message ?? "Unknown error" };
      if (name === "./content-catalog") return content;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { api: module.exports, state, profile, auth, timestamp };
}

test("a content save atomically writes current record and identical immutable history snapshot only", async () => {
  const { api, state, profile } = mockedContentFirebase();
  const data = tutorial();
  const revision = await api.saveManagedContent(profile, { kind: "tutorial", key: data.id, data, archived: false });
  assert.equal(revision, 1);
  assert.deepEqual(state.writes.map((write) => write.path), ["managedContent/tutorial--sample-skill/revisions/1", "managedContent/tutorial--sample-skill"]);
  const current = state.documents.get("managedContent/tutorial--sample-skill");
  const history = state.documents.get("managedContent/tutorial--sample-skill/revisions/1");
  assert.equal(current, history);
  assert.equal(current.createdBy, profile.uid);
  assert.equal(current.updatedBy, profile.uid);
  assert.equal(current.createdAt, current.updatedAt);
});

test("subsequent edits preserve creation metadata, append history and never overwrite previous snapshots", async () => {
  const { api, state, profile } = mockedContentFirebase();
  const data = tutorial();
  await api.saveManagedContent(profile, { kind: "tutorial", key: data.id, data, archived: false });
  const first = state.documents.get("managedContent/tutorial--sample-skill/revisions/1");
  const createdAt = first.createdAt;
  const revision = await api.saveManagedContent(profile, { kind: "tutorial", key: data.id, data: { ...data, title: "Updated" }, archived: true }, 1);
  assert.equal(revision, 2);
  assert.equal(state.documents.get("managedContent/tutorial--sample-skill/revisions/1"), first);
  const current = state.documents.get("managedContent/tutorial--sample-skill");
  assert.equal(current.createdAt, createdAt);
  assert.equal(current.createdBy, first.createdBy);
  assert.equal(current.archived, true);
  assert.equal(current.data.title, "Updated");
  assert.equal(state.documents.get("managedContent/tutorial--sample-skill/revisions/2"), current);
});

test("stale revisions fail before any write and concurrent edits cannot silently overwrite", async () => {
  const { api, state, profile } = mockedContentFirebase();
  const data = tutorial();
  const draft = { kind: "tutorial", key: data.id, data, archived: false };
  const results = await Promise.allSettled([api.saveManagedContent(profile, draft), api.saveManagedContent(profile, { ...draft, data: { ...data, title: "Other edit" } })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.match(results.find((result) => result.status === "rejected").reason.message, /Another director/);
  assert.equal(state.writes.length, 2);
  await assert.rejects(api.saveManagedContent(profile, draft, 3), /Another director/);
  assert.equal(state.writes.length, 2);
});

test("failed transaction commits leave both current record and history unchanged", async () => {
  const { api, state, profile } = mockedContentFirebase();
  state.failCommit = true;
  const data = tutorial();
  await assert.rejects(api.saveManagedContent(profile, { kind: "tutorial", key: data.id, data, archived: false }), /commit failed/);
  assert.equal(state.documents.size, 0);
  assert.equal(state.writes.length, 0);
});

test("save requires an active verified director and validates content before starting a transaction", async () => {
  for (const role of ["mentee", "mentor"]) {
    const { api, state, profile } = mockedContentFirebase();
    await assert.rejects(api.saveManagedContent({ ...profile, role }, { kind: "tutorial", key: "sample-skill", data: tutorial(), archived: false }), /director/);
    assert.equal(state.transactions, 0);
  }
  const { api, state, profile, auth } = mockedContentFirebase();
  const draft = { kind: "tutorial", key: "sample-skill", data: tutorial(), archived: false };
  for (const invalid of [{ ...profile, active: false }, { ...profile, uid: "another" }]) await assert.rejects(api.saveManagedContent(invalid, draft), /director/);
  auth.currentUser.emailVerified = false;
  await assert.rejects(api.saveManagedContent(profile, draft), /director/);
  auth.currentUser.emailVerified = true;
  await assert.rejects(api.saveManagedContent(profile, { ...draft, data: { ...draft.data, href: "javascript:x" } }));
  await assert.rejects(api.saveManagedContent(profile, draft, -1));
  assert.equal(state.transactions, 0);
});

test("current catalog subscriptions are available to verified active members, not guests", () => {
  for (const role of ["mentee", "mentor", "director"]) {
    const { api, state, profile } = mockedContentFirebase();
    const changes = [];
    const stop = api.watchManagedContent({ ...profile, role }, (entries) => changes.push(entries), (error) => assert.fail(error));
    assert.equal(state.listeners.length, 1);
    assert.equal(changes.length, 1);
    stop();
    assert.equal(state.listeners[0].active, false);
  }
  const { api, state, profile, auth } = mockedContentFirebase();
  auth.currentUser = null;
  api.watchManagedContent(profile, (entries) => assert.equal(entries.length, 0), (error) => assert.fail(error));
  assert.equal(state.listeners.length, 0);
  auth.currentUser = { uid: profile.uid, emailVerified: false };
  api.watchManagedContent(profile, (entries) => assert.equal(entries.length, 0), (error) => assert.fail(error));
  auth.currentUser.emailVerified = true;
  api.watchManagedContent({ ...profile, active: false }, (entries) => assert.equal(entries.length, 0), (error) => assert.fail(error));
  assert.equal(state.listeners.length, 0);
});

test("revision history is director-only, validated and returned newest first", async () => {
  const { api, state, profile } = mockedContentFirebase();
  const data = tutorial();
  const draft = { kind: "tutorial", key: data.id, data, archived: false };
  await api.saveManagedContent(profile, draft);
  await api.saveManagedContent(profile, { ...draft, data: { ...data, title: "New title" } }, 1);
  const seen = [];
  api.watchManagedContentHistory(profile, "tutorial", data.id, (entries) => seen.push(...entries), (error) => assert.fail(error));
  assert.deepEqual(seen.map((entry) => entry.revision), [2, 1]);
  assert.ok(seen[0].updatedAt instanceof Date);
  const errors = [];
  api.watchManagedContentHistory({ ...profile, role: "mentor" }, "tutorial", data.id, () => assert.fail("Mentor cannot read history"), (error) => errors.push(error));
  assert.match(errors[0], /director/);
  assert.equal(state.listeners.length, 1);
});

test("invalid stored records are reported instead of rendering unsafe or incomplete data", () => {
  const { api, state, profile } = mockedContentFirebase();
  const errors = [];
  state.documents.set("managedContent/tutorial--sample-skill", managed("tutorial", "sample-skill", { id: "sample-skill", title: "Incomplete", group: "Skills", area: "onboarding" }));
  api.watchManagedContent(profile, () => assert.fail("Invalid data must not be published"), (error) => errors.push(error));
  assert.match(errors[0], /required data fields/);
});

test("restoring older data is a new revision, not a deletion or rollback of past history", async () => {
  const { api, state, profile } = mockedContentFirebase();
  const data = tutorial();
  const draft = { kind: "tutorial", key: data.id, data, archived: false };
  await api.saveManagedContent(profile, draft);
  await api.saveManagedContent(profile, { ...draft, data: { ...data, title: "Changed" }, archived: true }, 1);
  const original = state.documents.get("managedContent/tutorial--sample-skill/revisions/1");
  assert.equal(await api.saveManagedContent(profile, { ...draft, data: original.data }, 2), 3);
  assert.equal(state.documents.get("managedContent/tutorial--sample-skill").data.title, data.title);
  assert.equal(state.documents.get("managedContent/tutorial--sample-skill/revisions/2").archived, true);
  assert.equal(state.documents.size, 4);
});

test("revision bounds prevent invalid expected versions and stop before history overflow", async () => {
  const { api, state, profile, timestamp } = mockedContentFirebase();
  const data = tutorial();
  const draft = { kind: "tutorial", key: data.id, data, archived: false };
  for (const revision of [-1, 0.5, 100001, NaN, "1"]) await assert.rejects(api.saveManagedContent(profile, draft, revision), /revision/);
  assert.equal(state.transactions, 0);
  state.documents.set("managedContent/tutorial--sample-skill", managed("tutorial", data.id, data, { revision: 99999, createdAt: timestamp, updatedAt: timestamp }));
  assert.equal(await api.saveManagedContent(profile, draft, 99999), 100000);
  assert.equal(state.writes.length, 2);
  await assert.rejects(api.saveManagedContent(profile, draft, 100000), /revision limit/);
  assert.equal(state.writes.length, 2);
});
