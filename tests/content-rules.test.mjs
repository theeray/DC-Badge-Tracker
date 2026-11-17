import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, setLogLevel, Timestamp, updateDoc, writeBatch } from "firebase/firestore";

setLogLevel("silent");
const projectId = "digital-corps-content-rules-test";
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
let environment;
let serial = 0;
const key = (prefix = "entry") => `${prefix}-${++serial}`;
const people = {
  director: { role: "director", active: true },
  director2: { role: "director", active: true },
  mentor: { role: "mentor", active: true },
  mentee: { role: "mentee", active: true },
  inactive: { role: "director", active: false },
};
const auth = (name, verified = true) => environment.authenticatedContext(name, { email: `${name}@example.edu`, email_verified: verified }).firestore();
const dataFor = (kind, id) => ({
  tutorial: { id, title: "Handwriting Animation with Matte Masking", group: "Motion Graphics", area: "content-creation", href: "https://youtu.be/o0-nyp4Q3hw", resourceLabel: "Open lesson", resourceNote: "Practice first.", additionalResources: [{ label: "Reference", href: "/resources/lesson.pdf" }], internal: false, searchTerms: ["After Effects", "handwritten"], tier: "" },
  area: { id, name: "Content Creation", shortName: "Content", eyebrow: "Make & produce", description: "Practice with support." },
  project: { id, title: "Practice project", discipline: "Video", kicker: "Apply a skill", timeline: "One week", format: "MP4", summary: "A small practice project.", briefHref: "/resources/brief.pdf", assetHref: "https://example.com/assets.zip", accent: "green", deliverables: ["Export a video"], workflow: ["Plan first"], constraints: ["Use official assets"], evaluation: ["Review with mentor"], assets: ["_MG_2145.jpg", "/resources/example.png", "https://example.com/image.jpg"] },
  resource: { id, section: "digital-corps", title: "DC brand guide", description: "Official standards.", href: "/resources/guide.pdf", format: "PDF", kind: "Guide" },
})[kind];
const record = (kind = "tutorial", id = key(kind), overrides = {}) => ({ kind, key: id, data: dataFor(kind, id), archived: false, revision: 1, createdBy: "director", createdAt: serverTimestamp(), updatedBy: "director", updatedAt: serverTimestamp(), ...overrides });
const ref = (db, value) => doc(db, "managedContent", `${value.kind}--${value.key}`);
const revisionRef = (db, value, revision = value.revision) => doc(ref(db, value), "revisions", String(revision));
const save = (db, value, options = {}) => {
  const batch = writeBatch(db);
  batch.set(options.parentRef ?? ref(db, value), value);
  batch.set(options.historyRef ?? revisionRef(db, value), options.history ?? value);
  return batch.commit();
};
const succeedsWithContext = async (label, promise) => {
  try { return await assertSucceeds(promise); }
  catch (error) { error.message = `${label}: ${error.message}`; throw error; }
};
const next = async (db, value, changes = {}, actor = "director") => ({ ...(await getDoc(ref(db, value))).data(), revision: value.revision + 1, updatedBy: actor, updatedAt: serverTimestamp(), ...changes });
const metadata = (bankId, changes = {}) => ({ bankId, archived: false, revision: 1, updatedBy: "director", updatedAt: serverTimestamp(), ...changes });
const four = (value) => Object.fromEntries(["q1", "q2", "q3", "q4"].map((id) => [id, typeof value === "function" ? value(id) : value]));
const bankId = "managed-knowledge";
const bankKey = `${bankId}_v1`;
const attempt = (changes = {}) => ({ ownerId: "mentee", ownerRole: "mentee", bankId, bankKey, version: 1, skillId: "test-skill", answers: four("My independent response."), createdAt: serverTimestamp(), ...changes });
const attemptRef = (db, id) => doc(db, "knowledgeAttempts", "mentee", "submissions", id);

before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(new URL("../firebase/firestore.rules", import.meta.url), "utf8") } });
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, person] of Object.entries(people)) {
      await setDoc(doc(db, "users", uid), { displayName: uid, email: `${uid}@example.edu`, ...person });
    }
    await setDoc(doc(db, "knowledgeBanks", bankKey), { bankId, version: 1, title: "Practice", skillIds: ["test-skill"], sourceUrl: "https://example.com/lesson", scope: "Four topics", questions: four((id) => ({ prompt: `Explain ${id}.`, topic: id })), createdBy: "director", createdAt: Timestamp.fromMillis(1) });
    await setDoc(doc(db, "knowledgeGuides", bankKey), { bankId, version: 1, questions: four({ expectedAnswer: "Private criteria", explanation: "Private rationale", studentFeedback: "Try a new example", practiceTask: "Demonstrate the topic" }), createdBy: "director", createdAt: Timestamp.fromMillis(1) });
    await setDoc(attemptRef(db, "historical"), attempt({ createdAt: Timestamp.fromMillis(1) }));
  });
});
after(async () => environment?.cleanup());

test("directors publish, archive and restore every content kind with immutable history", async () => {
  const db = auth("director");
  for (const kind of ["tutorial", "area", "project", "resource"]) {
    let value = record(kind);
    await assertSucceeds(save(db, value));
    const created = (await getDoc(ref(db, value))).data();
    value = await next(db, value, { archived: true });
    await assertSucceeds(save(db, value));
    value = await next(db, value, { archived: false }, "director2");
    await assertSucceeds(save(auth("director2"), value));
    const result = (await getDoc(ref(db, value))).data();
    assert.equal(result.archived, false);
    assert.equal(result.revision, 3);
    assert.equal(result.createdBy, "director");
    assert.ok(result.createdAt.isEqual(created.createdAt));
    assert.deepEqual((await getDoc(revisionRef(db, value))).data(), result);
    assert.equal((await getDocs(collection(ref(db, value), "revisions"))).size, 3);
    await assertFails(deleteDoc(ref(db, value)));
    await assertFails(updateDoc(revisionRef(db, value), { archived: true }));
    await assertFails(deleteDoc(revisionRef(db, value)));
  }
});

test("active verified members read current content, only directors read its revision history", async () => {
  const value = record();
  await assertSucceeds(save(auth("director"), value));
  for (const name of ["mentee", "mentor", "director"]) {
    await assertSucceeds(getDoc(ref(auth(name), value)));
    await assertSucceeds(getDocs(collection(auth(name), "managedContent")));
  }
  for (const name of ["mentee", "mentor"]) {
    await assertFails(getDoc(revisionRef(auth(name), value)));
    await assertFails(getDocs(collection(ref(auth(name), value), "revisions")));
  }
  for (const db of [environment.unauthenticatedContext().firestore(), auth("director", false), auth("inactive"), auth("unknown")]) {
    await assertFails(getDoc(ref(db, value)));
    await assertFails(getDocs(collection(db, "managedContent")));
    await assertFails(getDoc(revisionRef(db, value)));
    await assertFails(save(db, record()));
    await assertFails(deleteDoc(ref(db, value)));
  }
});

test("mentors and mentees cannot author, archive or delete content or append history", async () => {
  const value = record();
  await assertSucceeds(save(auth("director"), value));
  for (const name of ["mentor", "mentee"]) {
    const db = auth(name);
    await assertFails(save(db, record("tutorial", key("blocked"), { createdBy: name, updatedBy: name })));
    const changed = await next(auth("director"), value, { archived: true }, name);
    await assertFails(save(db, changed));
    await assertFails(setDoc(revisionRef(db, changed), changed));
    await assertFails(deleteDoc(ref(db, value)));
  }
});

test("current writes and matching newly appended history are inseparable", async () => {
  const db = auth("director");
  const value = record();
  await assertFails(setDoc(ref(db, value), value));
  await assertFails(setDoc(revisionRef(db, value), value));
  await assertFails(save(db, value, { history: { ...value, archived: true } }));
  await assertFails(save(db, value, { historyRef: revisionRef(db, value, "wrong") }));
  await assertSucceeds(save(db, value));
  const changed = await next(db, value, { archived: true });
  await assertFails(setDoc(ref(db, changed), changed));
  await assertFails(setDoc(revisionRef(db, changed), changed));
  await assertFails(save(db, changed, { history: { ...changed, data: { ...changed.data, title: "Tampered" } } }));
  await assertFails(save(db, changed, { historyRef: revisionRef(db, changed, 1) }));
  await assertSucceeds(save(db, changed));
  const old = (await getDoc(revisionRef(db, changed))).data();
  await assertFails(setDoc(revisionRef(db, changed, 3), old));
  await assertFails(save(db, { ...changed, revision: 4, updatedAt: serverTimestamp() }));
  await assertFails(save(db, { ...changed, updatedAt: serverTimestamp() }));
});

test("content identities, actors, timestamps and revision limits cannot be spoofed", async () => {
  const db = auth("director");
  const mutations = [
    (v) => { v.revision = 2; }, (v) => { v.revision = 1.5; }, (v) => { v.revision = 100001; },
    (v) => { v.createdBy = "mentor"; }, (v) => { v.updatedBy = "mentor"; },
    (v) => { v.createdAt = Timestamp.fromMillis(1); }, (v) => { v.updatedAt = Timestamp.fromMillis(1); },
    (v) => { v.archived = "false"; }, (v) => { v.data.id = "someone-else"; },
    (v) => { v.extra = "not allowed"; }, (v) => { v.data = []; },
  ];
  for (const mutate of mutations) {
    const value = record(); mutate(value);
    await assertFails(save(db, value));
  }
  const mismatch = record();
  await assertFails(save(db, mismatch, { parentRef: doc(db, "managedContent", `area--${mismatch.key}`) }));
  for (const invalidKey of ["UPPER", "a_b", "a--b", "-first", "x".repeat(81)]) {
    await assertFails(save(db, record("tutorial", invalidKey)));
  }
  const value = record();
  await assertSucceeds(save(db, value));
  for (const changes of [{ createdBy: "director2" }, { createdAt: serverTimestamp() }, { updatedBy: "mentor" }, { updatedAt: Timestamp.fromMillis(1) }, { revision: 100001 }, { key: key("other") }, { kind: "resource" }]) {
    await assertFails(save(db, await next(db, value, changes)));
  }
});

test("learning areas cannot shadow reserved navigation IDs", async () => {
  const db = auth("director");
  for (const id of ["admin", "brand-guides", "content-editor", "dc-meet", "knowledge-checks", "member-development", "new-hire-onboarding", "overview", "projects", "skills-dashboard", "time-clock"]) {
    await assertFails(save(db, record("area", id)));
  }
  await assertSucceeds(save(db, record("area", "fabrication")));
});

test("all outer and per-kind fields are required and extra fields fail on create and update", async () => {
  const db = auth("director");
  const outerFields = ["kind", "key", "data", "archived", "revision", "createdBy", "createdAt", "updatedBy", "updatedAt"];
  for (const field of outerFields) {
    const value = record();
    const parent = ref(db, value); const history = revisionRef(db, value);
    delete value[field];
    await assertFails(save(db, value, { parentRef: parent, historyRef: history }));
  }
  for (const kind of ["tutorial", "area", "project", "resource"]) {
    for (const field of Object.keys(dataFor(kind, "placeholder"))) {
      const value = record(kind); delete value.data[field];
      await assertFails(save(db, value));
    }
    const value = record(kind);
    await assertSucceeds(save(db, value));
    const added = await next(db, value); added.data.extra = "not allowed";
    await assertFails(save(db, added));
    const removed = await next(db, value); delete removed.data.title;
    if (kind === "area") delete removed.data.name;
    await assertFails(save(db, removed));
    const extra = record(kind); extra.data.extra = "not allowed";
    await assertFails(save(db, extra));
    await assertFails(save(db, await next(db, value, { extra: "not allowed" })));
  }
});

test("kind data strings, enums, array sizes and every bounded array item are checked", async () => {
  const db = auth("director");
  const cases = [
    ["tutorial", (d) => { d.title = " "; }], ["tutorial", (d) => { d.title = "x".repeat(161); }],
    ["tutorial", (d) => { d.group = 3; }], ["tutorial", (d) => { d.area = "invalid_area"; }],
    ["tutorial", (d) => { d.resourceLabel = "x".repeat(161); }], ["tutorial", (d) => { d.resourceNote = "x".repeat(1601); }],
    ["tutorial", (d) => { d.internal = "true"; }], ["tutorial", (d) => { d.tier = "Bronze"; }],
    ["tutorial", (d) => { d.searchTerms = Array(13).fill("term"); }], ["tutorial", (d) => { d.searchTerms = [...Array(11).fill("term"), 3]; }],
    ["tutorial", (d) => { d.searchTerms = ["x".repeat(161)]; }], ["tutorial", (d) => { d.additionalResources = Array(7).fill({ label: "Good", href: "/good" }); }],
    ["tutorial", (d) => { d.additionalResources = [...Array(5).fill({ label: "Good", href: "/good" }), { label: " ", href: "/bad" }]; }],
    ["tutorial", (d) => { d.additionalResources = [{ label: "Good", href: "/good", extra: true }]; }],
    ["area", (d) => { d.shortName = "x".repeat(81); }], ["area", (d) => { d.name = ""; }],
    ["area", (d) => { d.eyebrow = false; }], ["area", (d) => { d.description = "x".repeat(1601); }],
    ["project", (d) => { d.discipline = "x".repeat(161); }], ["project", (d) => { d.summary = "x".repeat(1601); }],
    ["project", (d) => { d.accent = "red"; }], ["project", (d) => { d.deliverables = Array(13).fill("item"); }],
    ...["deliverables", "workflow", "constraints", "evaluation"].flatMap((field) => [
      ["project", (d) => { d[field] = [...Array(11).fill("item"), " "]; }],
      ["project", (d) => { d[field] = ["x".repeat(1001)]; }],
    ]),
    ["project", (d) => { d.assets = Array(13).fill("asset.png"); }],
    ["resource", (d) => { d.section = "faculty-private"; }], ["resource", (d) => { d.format = 3; }],
    ["resource", (d) => { d.kind = "x".repeat(161); }], ["resource", (d) => { d.description = "x".repeat(1601); }],
  ];
  for (const [kind, mutate] of cases) {
    const value = record(kind); mutate(value.data);
    await assertFails(save(db, value));
  }
});

test("maximum-length valid lists and their final items work without rule evaluation overflow", async () => {
  const db = auth("director");
  const project = record("project");
  for (const field of ["deliverables", "workflow", "constraints", "evaluation"]) project.data[field] = Array(12).fill("A".repeat(1000));
  project.data.assets = Array(12).fill("_MG_2145.jpg");
  await succeedsWithContext("maximum project create", save(db, project));
  const longUrl = "https://example.com/" + "a".repeat(1000 - "https://example.com/".length);
  const maximumUpdate = await next(db, project, { archived: true });
  Object.assign(maximumUpdate.data, { assets: Array(12).fill(longUrl), briefHref: longUrl, assetHref: longUrl, summary: "A".repeat(1600) });
  await succeedsWithContext("maximum project update", save(db, maximumUpdate));
  const tutorial = record();
  tutorial.data.searchTerms = Array(12).fill("A".repeat(160));
  tutorial.data.additionalResources = Array(6).fill({ label: "A".repeat(160), href: longUrl });
  tutorial.data.resourceNote = "A".repeat(1600);
  await succeedsWithContext("maximum tutorial create", save(db, tutorial));
  await succeedsWithContext("maximum tutorial update", save(db, await next(db, tutorial, { archived: true })));
});

test("text-list validation rejects every non-string type, NUL and blank segments, while preserving empty and multiline lists", async () => {
  const db = auth("director");
  for (const invalid of [3, false, null, { text: "a\u0000b" }, ["a\u0000b"], "a\u0000b", "", " \n\t "]) {
    for (const kind of ["tutorial", "project"]) {
      const value = record(kind);
      value.data[kind === "tutorial" ? "searchTerms" : "workflow"] = ["First", invalid, "Last"];
      // The Firestore SDK itself rejects nested arrays before dispatch. All
      // other invalid values reach the emulator and must fail permission checks.
      await assert.rejects(async () => save(db, value), (error) => ["permission-denied", "invalid-argument"].includes(error.code));
      assert.equal((await getDoc(ref(db, value))).exists(), false);
    }
  }
  const value = record("project");
  Object.assign(value.data, { deliverables: [], workflow: ["First\nsecond", "  Real text  "], constraints: [], evaluation: [], assets: [] });
  await assertSucceeds(save(db, value));
});

test("all nested and primary content URLs reject unsafe protocols, controls, credentials and protocol-relative paths", async () => {
  const db = auth("director");
  const destinations = [
    ["tutorial", (d, href) => { d.href = href; }],
    ["tutorial", (d, href) => { d.additionalResources = [...Array(5).fill({ label: "Good", href: "/good" }), { label: "Last", href }]; }],
    ["project", (d, href) => { d.briefHref = href; }], ["project", (d, href) => { d.assetHref = href; }],
    ["project", (d, href) => { d.assets = [...Array(11).fill("valid.png"), href]; }],
    ["resource", (d, href) => { d.href = href; }],
  ];
  for (const invalid of ["javascript:alert(1)", "http://example.com/a", "//evil.example/a", "/\\evil.example/a", "https://user:pass@example.com/a", "https://example.com/a\nb", "https://example.com/a\tb", "https://example.com/a\u007fb", "https://example.com/a b", "https://"] ) {
    for (const [kind, apply] of destinations) {
      const value = record(kind); apply(value.data, invalid);
      await assertFails(save(db, value));
    }
  }
  for (const invalid of ["..", "../secret", "folder/file.png", "two..png", "\\evil.png", ".hidden.png", "bad\u0000.png"]) {
    const value = record("project"); value.data.assets = [invalid];
    await assertFails(save(db, value));
  }
});

test("safe HTTPS/root-relative links, optional blanks and existing asset filenames are supported", async () => {
  const db = auth("director");
  for (const href of ["https://example.com/lesson?version=1#next", "/resources/reference.pdf", "/"]) {
    const value = record(); value.data.href = href; value.data.additionalResources = [{ label: "Link", href }];
    await assertSucceeds(save(db, value));
  }
  const value = record();
  Object.assign(value.data, { href: "", resourceLabel: "", resourceNote: "", additionalResources: [], searchTerms: [], tier: "Gold" });
  await assertSucceeds(save(db, value));
  const project = record("project");
  project.data.assetHref = ""; project.data.assets = ["_MG_2222.jpg", "Reference photo-1.png", "/asset.jpg", "https://example.com/asset.jpg"];
  await assertSucceeds(save(db, project));
  for (const kind of ["resource", "project"]) {
    const required = record(kind);
    required.data[kind === "resource" ? "href" : "briefHref"] = "";
    await assertFails(save(db, required));
  }
});

test("knowledge catalog reads are verified-member only and metadata writes are director only", async () => {
  const id = key("knowledge");
  await assertSucceeds(setDoc(doc(auth("director"), "knowledgeCatalog", id), metadata(id)));
  for (const name of ["mentee", "mentor", "director"]) {
    await assertSucceeds(getDoc(doc(auth(name), "knowledgeCatalog", id)));
    await assertSucceeds(getDocs(collection(auth(name), "knowledgeCatalog")));
  }
  for (const db of [auth("mentor"), auth("mentee"), auth("inactive"), auth("director", false), auth("unknown"), environment.unauthenticatedContext().firestore()]) {
    const invalidId = key("knowledge");
    await assertFails(setDoc(doc(db, "knowledgeCatalog", invalidId), metadata(invalidId)));
    await assertFails(updateDoc(doc(db, "knowledgeCatalog", id), { archived: true, revision: 2, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, "knowledgeCatalog", id)));
  }
  for (const db of [auth("inactive"), auth("director", false), auth("unknown"), environment.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(db, "knowledgeCatalog", id)));
  }
});

test("knowledge metadata enforces exact schema, immutable identity, actors, timestamps and revision progression", async () => {
  const db = auth("director");
  const mutations = [
    (v) => { delete v.archived; }, (v) => { v.extra = true; }, (v) => { v.bankId = "wrong-id"; },
    (v) => { v.archived = 1; }, (v) => { v.updatedBy = "mentor"; }, (v) => { v.updatedAt = Timestamp.fromMillis(1); },
    (v) => { v.revision = 0; }, (v) => { v.revision = 2; }, (v) => { v.revision = 1.5; }, (v) => { v.revision = 100001; },
  ];
  for (const mutate of mutations) {
    const id = key("knowledge"); const value = metadata(id); mutate(value);
    await assertFails(setDoc(doc(db, "knowledgeCatalog", id), value));
  }
  for (const invalidId of ["Not-slug", "x".repeat(81)]) await assertFails(setDoc(doc(db, "knowledgeCatalog", invalidId), metadata(invalidId)));
  const id = key("knowledge");
  await assertSucceeds(setDoc(doc(db, "knowledgeCatalog", id), metadata(id)));
  for (const changes of [{ revision: 1 }, { revision: 3 }, { bankId: "wrong-id" }, { extra: true }, { updatedBy: "mentor" }, { updatedAt: Timestamp.fromMillis(1) }]) {
    await assertFails(setDoc(doc(db, "knowledgeCatalog", id), metadata(id, { revision: 2, ...changes })));
  }
  const missing = metadata(id, { revision: 2 }); delete missing.archived;
  await assertFails(setDoc(doc(db, "knowledgeCatalog", id), missing));
  await assertSucceeds(setDoc(doc(db, "knowledgeCatalog", id), metadata(id, { revision: 2, archived: true })));
  await assertSucceeds(setDoc(doc(auth("director2"), "knowledgeCatalog", id), metadata(id, { revision: 3, updatedBy: "director2", archived: false })));
  await assertFails(deleteDoc(doc(db, "knowledgeCatalog", id)));
});

test("archiving a knowledge bank blocks new attempts without hiding history, private guides or mentor reviews", async () => {
  const db = auth("director");
  // Existing banks without catalog metadata retain their original behavior.
  await assertSucceeds(setDoc(attemptRef(auth("mentee"), "before-catalog"), attempt()));
  await assertSucceeds(setDoc(doc(db, "knowledgeCatalog", bankId), metadata(bankId, { archived: true })));
  await assertFails(setDoc(attemptRef(auth("mentee"), "blocked-archived"), attempt()));
  await assertSucceeds(getDoc(attemptRef(auth("mentee"), "historical")));
  await assertSucceeds(getDoc(attemptRef(auth("mentor"), "historical")));
  await assertSucceeds(getDoc(doc(auth("mentor"), "knowledgeGuides", bankKey)));
  await assertFails(getDoc(doc(auth("mentee"), "knowledgeGuides", bankKey)));
  await assertSucceeds(setDoc(doc(attemptRef(auth("mentor"), "historical"), "reviews", "after-archive"), {
    reviewerId: "mentor", reviewerName: "mentor", verdicts: four("incorrect"), feedback: four("Review the process."), practiceTasks: four("Demonstrate a fresh example."), summary: "Practice first.", score: 0, createdAt: serverTimestamp(), status: "graded", reason: "",
  }));
  await assertSucceeds(setDoc(doc(db, "knowledgeCatalog", bankId), metadata(bankId, { revision: 2, archived: false })));
  await assertSucceeds(setDoc(attemptRef(auth("mentee"), "after-restore"), attempt()));
});
