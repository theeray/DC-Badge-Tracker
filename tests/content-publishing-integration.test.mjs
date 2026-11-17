import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test, { after, before } from "node:test";
import ts from "typescript";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import * as firestore from "firebase/firestore";

// This suite intentionally invokes the application's actual persistence code
// against real SDK transactions and the local rules emulator. No production
// Firebase initialization, credentials, Auth users, or network hosts are used.
const projectId = "digital-corps-cms-sdk-integration-test";
const [host, portText] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
if (!["127.0.0.1", "localhost"].includes(host) || !/^\d+$/.test(portText)) {
  throw new Error("Content publishing integration tests require an explicit loopback Firestore emulator.");
}
firestore.setLogLevel("silent");
let environment;
let director;
let director2;
let mentee;
let initialProfiles;
let initialProgress;
const modelCache = new Map();
const people = {
  director: { uid: "sdk-director", displayName: "SDK Director", email: "sdk-director@example.edu", role: "director", active: true },
  director2: { uid: "sdk-director-two", displayName: "SDK Director Two", email: "sdk-director-two@example.edu", role: "director", active: true },
  mentee: { uid: "sdk-mentee", displayName: "SDK Mentee", email: "sdk-mentee@live.bemidjistate.edu", role: "mentee", active: true },
};

function evaluateAppModule(filename, firebaseExports) {
  const path = fileURLToPath(new URL(`../app/${filename}`, import.meta.url));
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const require = (name) => {
    if (name === "firebase/firestore") return firestore;
    if (name === "./firebase") return firebaseExports;
    if (["./content-catalog", "./knowledge-catalog"].includes(name)) {
      if (!modelCache.has(name)) modelCache.set(name, evaluateAppModule(`${name.slice(2)}.ts`, firebaseExports));
      return modelCache.get(name);
    }
    if (/^\.\/knowledge-banks\/[a-z-]+\.json$/.test(name)) {
      return JSON.parse(readFileSync(new URL(`../app/${name.slice(2)}`, import.meta.url), "utf8"));
    }
    throw new Error(`Unexpected application dependency in emulator test: ${name}`);
  };
  // Keep native Object/Date/URL prototypes: real Firestore rejects objects from
  // a separate VM realm as custom classes. Only imports are replaced, never SDK
  // writes or transactions. No application Firebase configuration is loaded.
  const execute = vm.runInThisContext(`(function(require, exports, module) {\n${code}\n})`, { filename: path });
  execute(require, module.exports, module);
  return module.exports;
}

function actor(person) {
  const db = environment.authenticatedContext(person.uid, { email: person.email, email_verified: true }).firestore();
  const imports = {
    db,
    auth: { currentUser: { uid: person.uid, emailVerified: true } },
    readableFirebaseError: (error) => error?.message ?? String(error),
  };
  return {
    db, profile: person,
    content: evaluateAppModule("content-firebase.ts", imports),
    knowledge: evaluateAppModule("knowledge-firebase.ts", imports),
  };
}

function firstSnapshot(subscribe, predicate = () => true) {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    const timeout = setTimeout(() => { stop(); reject(new Error("Expected emulator snapshot did not arrive.")); }, 10000);
    const done = (operation, value) => { clearTimeout(timeout); stop(); operation(value); };
    stop = subscribe((value) => { if (predicate(value)) done(resolve, value); }, (error) => done(reject, new Error(String(error))));
  });
}

async function assertAccountsAndProgressPreserved() {
  const profiles = await Promise.all(Object.values(people).map(async (person) => (await firestore.getDoc(firestore.doc(director.db, "users", person.uid))).data()));
  assert.deepEqual(profiles, initialProfiles, "Content publication must not change account data or roles");
  assert.deepEqual((await firestore.getDoc(firestore.doc(director.db, "progress", people.mentee.uid))).data(), initialProgress, "Content publication must not change saved tutorial progress");
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host, port: Number(portText), rules: readFileSync(new URL("../firebase/firestore.rules", import.meta.url), "utf8") },
  });
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const person of Object.values(people)) {
      const { uid, ...profile } = person;
      await firestore.setDoc(firestore.doc(db, "users", uid), {
        ...profile, createdAt: firestore.Timestamp.fromMillis(1000), updatedAt: firestore.Timestamp.fromMillis(2000),
      });
    }
    await firestore.setDoc(firestore.doc(db, "progress", people.mentee.uid), {
      ownerId: people.mentee.uid, statuses: { "existing-skill": "complete", "sdk-learning-skill": "learning" },
      updatedAt: firestore.Timestamp.fromMillis(3000),
    });
  });
  director = actor(people.director);
  director2 = actor(people.director2);
  mentee = actor(people.mentee);
  initialProfiles = await Promise.all(Object.values(people).map(async (person) => (await firestore.getDoc(firestore.doc(director.db, "users", person.uid))).data()));
  initialProgress = (await firestore.getDoc(firestore.doc(director.db, "progress", people.mentee.uid))).data();
});

after(async () => { await environment?.cleanup(); });

const tutorialData = (id) => ({
  id, title: "Real SDK publishing lesson", group: "Motion Graphics", area: "content-creation",
  href: "https://example.com/lesson", resourceLabel: "Open lesson", resourceNote: "Practice with a mentor.",
  additionalResources: [{ label: "Reference", href: "/resources/reference.pdf" }], internal: false, searchTerms: ["animation"], tier: "",
});
const contentData = (kind, id) => ({
  tutorial: tutorialData(id),
  area: { id, name: "Real SDK Learning Path", shortName: "SDK Path", eyebrow: "Practice", description: "A safe emulator-only learning path." },
  project: {
    id, title: "Real SDK practice project", discipline: "Video", kicker: "Apply a skill", summary: "A short practice project.", timeline: "One week", format: "MP4",
    briefHref: "/briefs/sdk-test.pdf", assetHref: "https://example.com/assets.zip", accent: "green",
    deliverables: ["Export a short video"], workflow: ["Plan", "Create", "Review"], constraints: ["Use official brand assets"], evaluation: ["Discuss with a mentor"], assets: ["_MG_5086-14.jpg"],
  },
  resource: { id, section: "digital-corps", title: "Real SDK resource", description: "A test link, not a production upload.", href: "/resources/sdk-guide.pdf", format: "PDF", kind: "Guide" },
})[kind];

test("real application saves publish, edit, archive and restore every content kind without changing accounts or progress", { timeout: 60000 }, async () => {
  for (const kind of ["tutorial", "area", "project", "resource"]) {
    const key = `sdk-${kind}`;
    const reference = firestore.doc(director.db, "managedContent", `${kind}--${key}`);
    const data = contentData(kind, key);
    const draft = { kind, key, data, archived: false };
    assert.equal(await director.content.saveManagedContent(director.profile, draft), 1);
    const first = (await firestore.getDoc(reference)).data();
    const changed = kind === "area" ? { ...data, name: "Edited SDK path" } : { ...data, title: "Edited SDK content" };
    assert.equal(await director2.content.saveManagedContent(director2.profile, { ...draft, data: changed }, 1), 2);
    assert.equal(await director.content.saveManagedContent(director.profile, { ...draft, data: changed, archived: true }, 2), 3);
    assert.equal(await director.content.saveManagedContent(director.profile, draft, 3), 4);
    const current = (await firestore.getDoc(reference)).data();
    assert.deepEqual(current.data, data);
    assert.equal(current.archived, false);
    assert.equal(current.revision, 4);
    assert.equal(current.createdBy, people.director.uid);
    assert.ok(current.createdAt.isEqual(first.createdAt));
    const history = await firestore.getDocs(firestore.collection(reference, "revisions"));
    assert.equal(history.size, 4);
    for (const item of history.docs) {
      assert.equal(String(item.data().revision), item.id);
      assert.equal(item.data().createdBy, people.director.uid);
      assert.ok(item.data().createdAt.isEqual(first.createdAt));
    }
    assert.deepEqual((await firestore.getDoc(firestore.doc(reference, "revisions", "1"))).data(), first);
    assert.deepEqual((await firestore.getDoc(firestore.doc(reference, "revisions", "4"))).data(), current);
    await assert.rejects(director.content.saveManagedContent(director.profile, { ...draft, archived: true }, 2), /Another director/);
    assert.equal((await firestore.getDocs(firestore.collection(reference, "revisions"))).size, 4);
    await assertFails(firestore.updateDoc(firestore.doc(reference, "revisions", "1"), { archived: true }));
    await assertAccountsAndProgressPreserved();
  }
});

test("real catalog and director-history listeners deserialize committed SDK timestamps and revisions", { timeout: 15000 }, async () => {
  const entries = await firstSnapshot((onChange, onError) => mentee.content.watchManagedContent(mentee.profile, onChange, onError), (items) => items.some((item) => item.key === "sdk-tutorial"));
  const tutorial = entries.find((entry) => entry.key === "sdk-tutorial");
  assert.equal(tutorial.revision, 4);
  assert.ok(tutorial.createdAt instanceof Date);
  assert.ok(tutorial.updatedAt instanceof Date);
  const revisions = await firstSnapshot((onChange, onError) => director.content.watchManagedContentHistory(director.profile, "tutorial", "sdk-tutorial", onChange, onError));
  assert.deepEqual(revisions.map((entry) => entry.revision), [4, 3, 2, 1]);
  await assertFails(firestore.getDoc(firestore.doc(mentee.db, "managedContent", "tutorial--sdk-tutorial", "revisions", "1")));
});

test("real SDK knowledge publication, attempts, grading, versioning and archive/restore preserve historical answers", { timeout: 60000 }, async () => {
  const key = "sdk-knowledge-skill";
  await director.content.saveManagedContent(director.profile, { kind: "tutorial", key, data: tutorialData(key), archived: false });
  const catalog = evaluateAppModule("knowledge-catalog.ts", {});
  const bank = {
    id: "sdk-custom-check", title: "Real SDK knowledge check", version: 1, skillIds: [key],
    sourceUrl: "https://example.com/lesson", scope: "Explain the workflow in your own words.",
    questions: catalog.questionIds.map((id) => ({ id, prompt: `Explain the process for ${id}.`, topic: `Topic ${id}` })),
  };
  const guide = {
    bankId: bank.id, version: 1,
    questions: Object.fromEntries(catalog.questionIds.map((id) => [id, {
      expectedAnswer: `Private criterion for ${id}, version 1.`, explanation: "Private mentor rationale.",
      studentFeedback: "Revisit the relevant part of the lesson.", practiceTask: "Demonstrate a new example to a mentor.",
    }])),
  };
  assert.equal(await director.knowledge.publishKnowledgeCheck(director.profile, bank, guide, 0, 0), "sdk-custom-check_v1");
  const publicReference = firestore.doc(director.db, "knowledgeBanks", "sdk-custom-check_v1");
  const guideReference = firestore.doc(director.db, "knowledgeGuides", "sdk-custom-check_v1");
  const publicV1 = (await firestore.getDoc(publicReference)).data();
  const privateV1 = (await firestore.getDoc(guideReference)).data();
  const metadataReference = firestore.doc(director.db, "knowledgeCatalog", bank.id);
  assert.equal((await firestore.getDoc(metadataReference)).data().revision, 1);
  assert.ok(!JSON.stringify(publicV1).includes("Private criterion"));
  assert.deepEqual(Object.keys(publicV1.questions.q1).sort(), ["prompt", "topic"]);
  assert.equal((await director.knowledge.fetchKnowledgeGuide("sdk-custom-check_v1")).questions.q1.expectedAnswer, guide.questions.q1.expectedAnswer);
  await assert.rejects(mentee.knowledge.fetchKnowledgeGuide("sdk-custom-check_v1"), (error) => error.code === "permission-denied");

  const published = await firstSnapshot((onChange, onError) => mentee.knowledge.watchPublishedBanks(onChange, onError));
  assert.equal(published.find((item) => item.id === bank.id).version, 1);
  const answers = Object.fromEntries(catalog.questionIds.map((id) => [id, `My independently written response to ${id}.`]));
  const firstAttemptId = await mentee.knowledge.submitKnowledgeAttempt(mentee.profile, bank, key, answers);
  const firstAttemptReference = firestore.doc(mentee.db, "knowledgeAttempts", mentee.profile.uid, "submissions", firstAttemptId);
  const firstAttempt = (await firestore.getDoc(firstAttemptReference)).data();
  assert.equal(firstAttempt.version, 1);
  assert.equal(firstAttempt.bankKey, "sdk-custom-check_v1");
  assert.deepEqual(firstAttempt.answers, answers);
  const reviewDraft = {
    verdicts: { q1: "correct", q2: "incorrect", q3: "correct", q4: "incorrect" },
    feedback: Object.fromEntries(catalog.questionIds.map((id) => [id, "Review the process and describe your reasoning."])),
    practiceTasks: Object.fromEntries(catalog.questionIds.map((id) => [id, "Complete a fresh demonstration before trying again."])),
    summary: "Two topics need more practice.", score: 0, status: "graded", reason: "",
  };
  const reviewId = await director.knowledge.saveKnowledgeReview(director.profile, mentee.profile.uid, firstAttemptId, reviewDraft, null);
  const reviewReference = firestore.doc(firstAttemptReference, "reviews", reviewId);
  const firstReview = (await firestore.getDoc(reviewReference)).data();
  assert.equal(firstReview.score, 2);
  assert.ok(!JSON.stringify(firstReview).includes("Private criterion"));

  const bankV2 = { ...bank, version: 2, title: "Updated real SDK check", questions: bank.questions.map((question) => ({ ...question, prompt: `${question.prompt} Include a new example.` })) };
  const guideV2 = { ...guide, version: 2 };
  assert.equal(await director.knowledge.publishKnowledgeCheck(director.profile, bankV2, guideV2, 1, 1), "sdk-custom-check_v2");
  assert.deepEqual((await firestore.getDoc(publicReference)).data(), publicV1);
  assert.deepEqual((await firestore.getDoc(guideReference)).data(), privateV1);
  assert.deepEqual((await firestore.getDoc(firstAttemptReference)).data(), firstAttempt);
  assert.deepEqual((await firestore.getDoc(reviewReference)).data(), firstReview);
  const secondAttemptId = await mentee.knowledge.submitKnowledgeAttempt(mentee.profile, bankV2, key, answers);
  assert.equal((await firestore.getDoc(firestore.doc(mentee.db, "knowledgeAttempts", mentee.profile.uid, "submissions", secondAttemptId))).data().version, 2);

  await director.knowledge.setKnowledgeCheckArchived(director.profile, bank.id, true, 2);
  assert.equal((await firestore.getDoc(metadataReference)).data().archived, true);
  await assert.rejects(mentee.knowledge.submitKnowledgeAttempt(mentee.profile, bankV2, key, answers), (error) => error.code === "permission-denied");
  assert.deepEqual((await firestore.getDoc(firstAttemptReference)).data(), firstAttempt);
  assert.deepEqual((await firestore.getDoc(reviewReference)).data(), firstReview);
  const visibleAttempts = await firstSnapshot((onChange, onError) => mentee.knowledge.watchKnowledgeAttempts(mentee.profile.uid, onChange, onError));
  assert.equal(visibleAttempts.length, 2);
  assert.ok(visibleAttempts.find((attempt) => attempt.id === firstAttemptId).createdAt instanceof Date);
  const visibleReviews = await firstSnapshot((onChange, onError) => mentee.knowledge.watchKnowledgeReviews(mentee.profile.uid, firstAttemptId, onChange, onError));
  assert.equal(visibleReviews[0].score, 2);

  await director.knowledge.setKnowledgeCheckArchived(director.profile, bank.id, false, 3);
  const restoredAttemptId = await mentee.knowledge.submitKnowledgeAttempt(mentee.profile, bankV2, key, answers);
  assert.ok(restoredAttemptId !== firstAttemptId && restoredAttemptId !== secondAttemptId);
  assert.equal((await firestore.getDoc(metadataReference)).data().revision, 4);
  const metadata = await firstSnapshot((onChange, onError) => mentee.knowledge.watchKnowledgeCatalog(onChange, onError));
  assert.deepEqual(metadata.find((entry) => entry.bankId === bank.id), { bankId: bank.id, archived: false, revision: 4 });
  await assertFails(firestore.updateDoc(publicReference, { title: "Must not mutate a published version" }));
  await assertFails(firestore.updateDoc(guideReference, { version: 2 }));
  await assertFails(firestore.updateDoc(firstAttemptReference, { answers: Object.fromEntries(catalog.questionIds.map((id) => [id, "Overwritten"])) }));
  await assertAccountsAndProgressPreserved();
});

test("real backend rules reject a mentee forging a director profile for publication", { timeout: 20000 }, async () => {
  const forgedProfile = { ...mentee.profile, role: "director" };
  await assert.rejects(mentee.content.saveManagedContent(forgedProfile, {
    kind: "tutorial", key: "sdk-forbidden-content", data: tutorialData("sdk-forbidden-content"), archived: false,
  }), (error) => error.code === "permission-denied");
  assert.equal((await firestore.getDoc(firestore.doc(director.db, "managedContent", "tutorial--sdk-forbidden-content"))).exists(), false);
  await assert.rejects(mentee.knowledge.setKnowledgeCheckArchived(forgedProfile, "sdk-custom-check", true, 4), (error) => error.code === "permission-denied");
  assert.equal((await firestore.getDoc(firestore.doc(director.db, "knowledgeCatalog", "sdk-custom-check"))).data().archived, false);
  await assertAccountsAndProgressPreserved();
});
