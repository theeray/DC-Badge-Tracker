import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as catalog from "../app/knowledge-catalog.ts";

const exampleBank = (version = 1) => ({ ...structuredClone(catalog.knowledgeBanks[0]), id: "kc-custom-editor", title: "Custom editorial check", version });
const exampleGuide = (version = 1) => ({ bankId: "kc-custom-editor", version, questions: Object.fromEntries(catalog.questionIds.map((id) => [id, {
  expectedAnswer: "A private example answer for this unit test.", explanation: "A private example explanation.",
  studentFeedback: "Review the relevant part of the lesson.", practiceTask: "Demonstrate this step to a mentor.",
}])) });
const director = { uid: "director", displayName: "Director", email: "director@example.org", role: "director", active: true };

test("latest published custom checks join the bundled catalog without losing historical versions", () => {
  const first = exampleBank(1), second = exampleBank(2);
  const source = [first, second];
  const visible = catalog.visibleKnowledgeCatalog(source);
  assert.equal(visible.length, catalog.knowledgeBanks.length + 1);
  assert.equal(visible.find((bank) => bank.id === first.id).version, 2);
  assert.equal(source.length, 2);
  assert.equal(catalog.getKnowledgeBankForSkill(first.skillIds[0], [second]), second);
});

test("saved same-version questions override bundled preview and archived checks are reversible", () => {
  const saved = { ...structuredClone(catalog.knowledgeBanks[0]), title: "Saved title" };
  assert.equal(catalog.visibleKnowledgeCatalog([saved]).find((bank) => bank.id === saved.id).title, "Saved title");
  const metadata = [{ bankId: saved.id, archived: true, revision: 1 }];
  assert.ok(!catalog.visibleKnowledgeCatalog([saved], metadata).some((bank) => bank.id === saved.id));
  assert.ok(catalog.visibleKnowledgeCatalog([saved], metadata, true).some((bank) => bank.id === saved.id));
  assert.ok(catalog.visibleKnowledgeCatalog([saved], [{ ...metadata[0], archived: false }]).some((bank) => bank.id === saved.id));
});

test("malformed incoming question banks cannot replace a valid catalog entry", () => {
  const invalid = { ...exampleBank(3), questions: [] };
  assert.ok(!catalog.visibleKnowledgeCatalog([invalid]).some((bank) => bank.id === invalid.id));
});

function mockedAuthoring() {
  const state = { documents: new Map(), writes: [], transactions: 0, commits: 0, reads: [] };
  const firestore = {
    collection: (_db, ...parts) => parts.join("/"),
    doc: (_db, ...parts) => parts.join("/"),
    serverTimestamp: () => "SERVER_TIMESTAMP",
    runTransaction: async (_db, callback) => {
      state.transactions += 1;
      const staged = [];
      const result = await callback({
        get: async (path) => {
          state.reads.push(path);
          const data = state.documents.get(path);
          return { exists: () => data !== undefined, data: () => data };
        },
        set: (path, data) => staged.push({ path, data }),
      });
      for (const write of staged) state.documents.set(write.path, write.data);
      state.writes.push(...staged); state.commits += 1;
      return result;
    },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL("../app/knowledge-firebase.ts", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    exports: module.exports, module, URL,
    require: (name) => {
      if (name === "firebase/firestore") return firestore;
      if (name === "./firebase") return { db: {}, readableFirebaseError: (error) => error.message };
      if (name === "./knowledge-catalog") return catalog;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { api: module.exports, state };
}

test("publication atomically writes public questions, a private guide, and catalog metadata", async () => {
  const { api, state } = mockedAuthoring();
  const key = await api.publishKnowledgeCheck(director, exampleBank(), exampleGuide(), 0, 0);
  assert.equal(key, "kc-custom-editor_v1");
  assert.equal(state.commits, 1);
  assert.equal(state.writes.length, 3);
  const questionBank = state.documents.get(`knowledgeBanks/${key}`);
  const privateGuide = state.documents.get(`knowledgeGuides/${key}`);
  const metadata = state.documents.get("knowledgeCatalog/kc-custom-editor");
  assert.equal(questionBank.createdBy, director.uid);
  assert.equal(questionBank.createdAt, "SERVER_TIMESTAMP");
  assert.deepEqual(Object.keys(questionBank.questions.q1).sort(), ["prompt", "topic"]);
  assert.ok(!JSON.stringify(questionBank).includes("private example"));
  assert.equal(privateGuide.questions.q1.expectedAnswer, exampleGuide().questions.q1.expectedAnswer);
  assert.equal(metadata.revision, 1); assert.equal(metadata.archived, false);
});

test("editing publishes a new version and never overwrites an earlier bank or guide", async () => {
  const { api, state } = mockedAuthoring();
  const first = { original: true };
  state.documents.set("knowledgeBanks/kc-custom-editor_v1", first);
  state.documents.set("knowledgeGuides/kc-custom-editor_v1", first);
  state.documents.set("knowledgeCatalog/kc-custom-editor", { bankId: "kc-custom-editor", revision: 4, archived: true });
  await api.publishKnowledgeCheck(director, exampleBank(2), exampleGuide(2), 1, 4);
  assert.equal(state.documents.get("knowledgeBanks/kc-custom-editor_v1"), first);
  assert.equal(state.documents.get("knowledgeGuides/kc-custom-editor_v1"), first);
  assert.equal(state.documents.get("knowledgeCatalog/kc-custom-editor").revision, 5);
  assert.equal(state.documents.get("knowledgeCatalog/kc-custom-editor").archived, false);
});

for (const conflict of ["metadata revision", "new bank already exists", "new guide already exists", "previous bank missing"]) {
  test(`publication rejects ${conflict} without partial writes`, async () => {
    const { api, state } = mockedAuthoring();
    if (conflict === "metadata revision") state.documents.set("knowledgeCatalog/kc-custom-editor", { revision: 1 });
    if (conflict === "new bank already exists") state.documents.set("knowledgeBanks/kc-custom-editor_v1", {});
    if (conflict === "new guide already exists") state.documents.set("knowledgeGuides/kc-custom-editor_v1", {});
    const version = conflict === "previous bank missing" ? 2 : 1;
    await assert.rejects(api.publishKnowledgeCheck(director, exampleBank(version), exampleGuide(version), version - 1, 0), /changed|missing/);
    assert.equal(state.commits, 0); assert.equal(state.writes.length, 0);
  });
}

for (const profile of [{ ...director, role: "mentee" }, { ...director, role: "mentor" }, { ...director, active: false }]) {
  test(`unauthorized ${profile.role}/${profile.active} cannot publish or archive`, async () => {
    const { api, state } = mockedAuthoring();
    await assert.rejects(api.publishKnowledgeCheck(profile, exampleBank(), exampleGuide(), 0, 0), /faculty director/);
    await assert.rejects(api.setKnowledgeCheckArchived(profile, "kc-custom-editor", true, 0), /faculty director/);
    assert.equal(state.transactions, 0);
  });
}

test("malformed or mismatched public/private versions fail before a write", async () => {
  const { api, state } = mockedAuthoring();
  await assert.rejects(api.publishKnowledgeCheck(director, exampleBank(), exampleGuide(2), 0, 0), /four questions/);
  await assert.rejects(api.publishKnowledgeCheck(director, exampleBank(2), exampleGuide(2), 0, 0), /four questions/);
  await assert.rejects(api.publishKnowledgeCheck(director, { ...exampleBank(), sourceUrl: "https://user:password@example.org/" }, exampleGuide(), 0, 0), /four questions/);
  assert.equal(state.transactions, 0);
});

test("authoring source URLs allow HTTPS only without credentials or hidden control characters", () => {
  const { api } = mockedAuthoring();
  assert.equal(api.validKnowledgeSourceUrl("https://example.org/tutorial?q=one#step"), true);
  for (const value of ["javascript:alert(1)", "http://example.org/", "https://", "https://user@example.org/", "https://example.org/\nother", "https://example.org/\\other", "//example.org/"]) {
    assert.equal(api.validKnowledgeSourceUrl(value), false, value);
  }
});

test("archive and restore change only metadata and retain question/answer histories", async () => {
  const { api, state } = mockedAuthoring();
  state.documents.set("knowledgeBanks/kc-custom-editor_v1", { retained: true });
  state.documents.set("knowledgeAttempts/student/submissions/attempt", { retained: true });
  await api.setKnowledgeCheckArchived(director, "kc-custom-editor", true, 0);
  assert.equal(state.documents.get("knowledgeCatalog/kc-custom-editor").archived, true);
  await api.setKnowledgeCheckArchived(director, "kc-custom-editor", false, 1);
  assert.equal(state.documents.get("knowledgeCatalog/kc-custom-editor").revision, 2);
  assert.equal(state.documents.get("knowledgeCatalog/kc-custom-editor").archived, false);
  assert.ok(state.writes.every((write) => write.path === "knowledgeCatalog/kc-custom-editor"));
  assert.ok(state.documents.get("knowledgeAttempts/student/submissions/attempt").retained);
});

test("archive rejects a stale revision without changing a director's newer setting", async () => {
  const { api, state } = mockedAuthoring();
  state.documents.set("knowledgeCatalog/kc-custom-editor", { revision: 2, archived: false });
  await assert.rejects(api.setKnowledgeCheckArchived(director, "kc-custom-editor", true, 1), /changed/);
  assert.equal(state.commits, 0);
});
