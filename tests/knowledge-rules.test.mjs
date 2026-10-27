import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, setLogLevel, Timestamp, updateDoc, where, writeBatch } from "firebase/firestore";

// Expected denial assertions should not flood CI logs with SDK error traces.
setLogLevel("silent");

const projectId = "digital-corps-badge-tracker-knowledge-rules-test";
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
let environment;
const people = {
  director: { uid: "director", role: "director", active: true },
  director2: { uid: "director2", role: "director", active: true },
  mentor: { uid: "mentor", role: "mentor", active: true },
  mentor2: { uid: "mentor2", role: "mentor", active: true },
  mentee: { uid: "mentee", role: "mentee", active: true },
  mentee2: { uid: "mentee2", role: "mentee", active: true },
  inactive: { uid: "inactive", role: "mentee", active: false },
};
const bankId = "kc-test";
const bankKey = `${bankId}_v1`;
const four = (value) => Object.fromEntries(["q1", "q2", "q3", "q4"].map((key) => [key, typeof value === "function" ? value(key) : value]));
const auth = (name, verified = true) => environment.authenticatedContext(people[name]?.uid ?? name, { email: `${name}@example.edu`, email_verified: verified }).firestore();
const bank = (overrides = {}) => ({
  bankId, version: 1, title: "Practice knowledge check", skillIds: ["test-skill", "same-lesson"],
  sourceUrl: "https://example.com/lesson", scope: "Four process questions.",
  questions: four((id) => ({ prompt: `Explain step ${id}.`, topic: `Topic ${id}` })),
  createdBy: "director", createdAt: serverTimestamp(), ...overrides,
});
const guide = (overrides = {}) => ({
  bankId, version: 1,
  questions: four(() => ({ expectedAnswer: "Private grading criterion.", explanation: "Private rationale.", studentFeedback: "Revisit this topic.", practiceTask: "Complete a fresh practice example." })),
  createdBy: "director", createdAt: serverTimestamp(), ...overrides,
});
const submission = (name = "mentee", overrides = {}) => ({
  ownerId: name, ownerRole: people[name].role, bankKey, bankId, version: 1, skillId: "test-skill",
  answers: four((id) => `My response to ${id}.`), createdAt: serverTimestamp(), ...overrides,
});
const review = (name = "mentor", overrides = {}) => ({
  reviewerId: name, reviewerName: name, verdicts: { q1: "correct", q2: "incorrect", q3: "correct", q4: "incorrect" },
  feedback: four("Revisit the topic."), practiceTasks: four("Practice a new example."),
  summary: "Two areas to practice before a new attempt.", score: 2, createdAt: serverTimestamp(), status: "graded", reason: "", ...overrides,
});
const attemptRef = (db, owner, id = "attempt1") => doc(db, "knowledgeAttempts", owner, "submissions", id);
const reviewRef = (db, owner = "mentee", id = "review1", attempt = "attempt1") => doc(attemptRef(db, owner, attempt), "reviews", id);

before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(new URL("../firebase/firestore.rules", import.meta.url), "utf8") } });
  await environment.withSecurityRulesDisabled(async (context) => {
    for (const person of Object.values(people)) {
      await setDoc(doc(context.firestore(), "users", person.uid), { displayName: person.uid, email: `${person.uid}@example.edu`, role: person.role, active: person.active });
    }
  });
  const db = auth("director");
  const batch = writeBatch(db);
  batch.set(doc(db, "knowledgeBanks", bankKey), bank());
  batch.set(doc(db, "knowledgeGuides", bankKey), guide());
  await assertSucceeds(batch.commit());
  for (const name of ["mentee", "mentee2", "mentor", "director"]) {
    await assertSucceeds(setDoc(attemptRef(auth(name), name), submission(name)));
  }
});

after(async () => environment?.cleanup());

test("knowledge banks and private guides have separate role-controlled reads", async () => {
  await assertSucceeds(getDoc(doc(auth("mentee"), "knowledgeBanks", bankKey)));
  await assertSucceeds(getDocs(collection(auth("mentee"), "knowledgeBanks")));
  await assertFails(getDoc(doc(auth("mentee"), "knowledgeGuides", bankKey)));
  await assertFails(getDocs(collection(auth("mentee"), "knowledgeGuides")));
  await assertSucceeds(getDoc(doc(auth("mentor"), "knowledgeGuides", bankKey)));
  await assertSucceeds(getDoc(doc(auth("director"), "knowledgeGuides", bankKey)));
});

test("anonymous, unverified, inactive, and unprofiled accounts cannot access knowledge data", async () => {
  for (const db of [environment.unauthenticatedContext().firestore(), auth("mentee", false), auth("inactive"), auth("unknown")]) {
    await assertFails(getDoc(doc(db, "knowledgeBanks", bankKey)));
    await assertFails(getDocs(collection(db, "knowledgeBanks")));
    await assertFails(getDoc(doc(db, "knowledgeGuides", bankKey)));
    await assertFails(getDoc(attemptRef(db, "mentee")));
    await assertFails(setDoc(attemptRef(db, "mentee", "blocked"), submission()));
  }
});

test("only directors publish immutable matching bank/guide versions", async () => {
  for (const name of ["mentee", "mentor"]) {
    await assertFails(setDoc(doc(auth(name), "knowledgeBanks", "kc-new_v1"), bank({ bankId: "kc-new", createdBy: name })));
    await assertFails(setDoc(doc(auth(name), "knowledgeGuides", "kc-new_v1"), guide({ bankId: "kc-new", createdBy: name })));
  }
  for (const path of ["knowledgeBanks", "knowledgeGuides"]) {
    await assertFails(updateDoc(doc(auth("director"), path, bankKey), { version: 2 }));
    await assertFails(deleteDoc(doc(auth("director"), path, bankKey)));
  }
  await assertFails(setDoc(doc(auth("director"), "knowledgeBanks", "wrong-key"), bank()));
  await assertFails(setDoc(doc(auth("director"), "knowledgeGuides", "kc-absent_v1"), guide({ bankId: "kc-absent" })));
  const db = auth("director");
  const batch = writeBatch(db);
  batch.set(doc(db, "knowledgeBanks", "kc-test_v2"), bank({ version: 2 }));
  batch.set(doc(db, "knowledgeGuides", "kc-test_v2"), guide({ version: 2 }));
  await assertSucceeds(batch.commit());
});

test("bank validation rejects missing fields, polluted schema, bad types, oversized fields and array items", async () => {
  const mutations = [
    (value) => { delete value.questions.q4; },
    (value) => { delete value.scope; },
    (value) => { value.questions.q1.answer = "leaked answer"; },
    (value) => { value.extra = true; },
    (value) => { value.version = "1"; },
    (value) => { value.title = "x".repeat(161); },
    (value) => { value.questions.q2.prompt = "x".repeat(1001); },
    (value) => { value.questions.q3.topic = "x".repeat(101); },
    (value) => { value.skillIds = ["valid", 32]; },
    (value) => { value.skillIds = ["valid", "x".repeat(101)]; },
    (value) => { value.skillIds = ["duplicate", "duplicate"]; },
    (value) => { value.skillIds = Array.from({ length: 11 }, (_, index) => `skill${index}`); },
    (value) => { value.sourceUrl = "javascript:alert(1)"; },
    (value) => { value.createdBy = "mentor"; },
    (value) => { value.createdAt = Timestamp.fromMillis(1); },
  ];
  for (let i = 0; i < mutations.length; i++) {
    const id = `kc-invalid-${i}`;
    const value = bank({ bankId: id });
    mutations[i](value);
    await assertFails(setDoc(doc(auth("director"), "knowledgeBanks", `${id}_v1`), value));
  }
});

test("private guide schema, identities, sizes and timestamps are validated", async () => {
  const mutations = [
    (value) => { value.questions.q1.expectedAnswer = "x".repeat(3001); },
    (value) => { value.questions.q2.explanation = "x".repeat(2001); },
    (value) => { value.questions.q3.studentFeedback = "x".repeat(1001); },
    (value) => { value.questions.q4.practiceTask = "x".repeat(1501); },
    (value) => { delete value.questions.q4; },
    (value) => { value.questions.q1.extra = "not allowed"; },
    (value) => { value.questions.q1.expectedAnswer = []; },
    (value) => { value.questions.q2.expectedAnswer = " "; },
    (value) => { value.createdBy = "mentor"; },
    (value) => { value.createdAt = Timestamp.fromMillis(1); },
    (value) => { value.extra = "pollution"; },
  ];
  for (let i = 0; i < mutations.length; i++) {
    const id = `kc-guide-invalid-${i}`;
    const db = auth("director");
    await assertSucceeds(setDoc(doc(db, "knowledgeBanks", `${id}_v1`), bank({ bankId: id })));
    const value = guide({ bankId: id });
    mutations[i](value);
    await assertFails(setDoc(doc(db, "knowledgeGuides", `${id}_v1`), value));
  }
});

test("attempt visibility is owner/director or active mentee reviewer, never peer/faculty exposure", async () => {
  await assertSucceeds(getDoc(attemptRef(auth("mentee"), "mentee")));
  await assertFails(getDoc(attemptRef(auth("mentee2"), "mentee")));
  await assertSucceeds(getDoc(attemptRef(auth("mentor"), "mentee")));
  await assertSucceeds(getDoc(attemptRef(auth("director"), "mentor")));
  await assertSucceeds(getDoc(attemptRef(auth("director2"), "director")));
  await assertFails(getDoc(attemptRef(auth("mentor"), "director")));
  await assertFails(getDoc(attemptRef(auth("mentee"), "director")));
  await assertFails(getDoc(attemptRef(auth("mentor2"), "mentor")));
  const own = query(collection(auth("mentee"), "knowledgeAttempts", "mentee", "submissions"), orderBy("createdAt", "desc"), limit(25));
  const menteeReview = query(collection(auth("mentor"), "knowledgeAttempts", "mentee", "submissions"), where("ownerRole", "==", "mentee"));
  await assertSucceeds(getDocs(own));
  await assertSucceeds(getDocs(menteeReview));
  await assertFails(getDocs(collection(auth("mentor"), "knowledgeAttempts", "mentee", "submissions")));
  await assertFails(getDocs(collection(auth("mentee2"), "knowledgeAttempts", "mentee", "submissions")));
  await assertFails(getDocs(collection(auth("mentor2"), "knowledgeAttempts", "mentor", "submissions")));
});

test("learner attempts cannot be forged for others, pregraded, overwritten, deleted, or replayed", async () => {
  const db = auth("mentee");
  await assertFails(setDoc(attemptRef(db, "mentee2", "forged-owner"), submission("mentee2")));
  await assertFails(setDoc(attemptRef(db, "mentee", "forged-role"), submission("mentee", { ownerRole: "director" })));
  await assertFails(setDoc(attemptRef(db, "mentee", "pregraded"), submission("mentee", { score: 4 })));
  await assertFails(setDoc(attemptRef(db, "mentee", "attempt1"), submission()));
  for (const name of ["mentee", "mentor", "director"]) {
    await assertFails(updateDoc(attemptRef(auth(name), "mentee"), { "answers.q1": "Rewritten response" }));
    await assertFails(deleteDoc(attemptRef(auth(name), "mentee")));
  }
});

test("attempt source, version, skill, answers and schema must be valid and timestamp trusted", async () => {
  const mutations = [
    { bankKey: "missing_v1", bankId: "missing" },
    { bankId: "another" },
    { version: 2 },
    { skillId: "not-in-this-bank" },
    { ownerId: "mentee2" },
    { answers: { q1: "one", q2: "two", q3: "three" } },
    { answers: four(" ") },
    { answers: four("\n\t \n") },
    { answers: four(23) },
    { answers: four("x".repeat(2001)) },
    { answers: { ...four("answer"), q5: "Extra" } },
    { createdAt: Timestamp.fromMillis(1) },
    { expectedAnswer: "No extra private fields" },
  ];
  for (let i = 0; i < mutations.length; i++) {
    await assertFails(setDoc(attemptRef(auth("mentee"), "mentee", `invalid-${i}`), submission("mentee", mutations[i])));
  }
  await assertSucceeds(setDoc(attemptRef(auth("mentee"), "mentee", "duplicate-lesson"), submission("mentee", { skillId: "same-lesson" })));
  await assertSucceeds(setDoc(attemptRef(auth("mentee"), "mentee", "multiline-answer"), submission("mentee", { answers: four("First step.\nSecond step.") })));
});

test("mentors grade mentees and append corrective revisions without modifying originals", async () => {
  const db = auth("mentor");
  await assertSucceeds(setDoc(reviewRef(db), review()));
  await assertSucceeds(setDoc(reviewRef(db, "mentee", "review2"), review("mentor", { verdicts: four("correct"), score: 4, summary: "Corrected review after checking the example." })));
  await assertSucceeds(getDoc(reviewRef(auth("mentee"))));
  await assertFails(getDoc(reviewRef(auth("mentee2"))));
  await assertSucceeds(getDocs(query(collection(attemptRef(auth("mentee"), "mentee"), "reviews"), orderBy("createdAt", "desc"))));
  for (const name of ["mentor", "director", "mentee"]) {
    await assertFails(updateDoc(reviewRef(auth(name)), { score: 4 }));
    await assertFails(deleteDoc(reviewRef(auth(name))));
  }
  const original = await getDoc(reviewRef(auth("mentee")));
  assert.equal(original.data().score, 2);
});

test("mentors cannot self-grade, grade other mentors/faculty, impersonate or void", async () => {
  await assertFails(setDoc(reviewRef(auth("mentee"), "mentee", "self"), review("mentee")));
  await assertFails(setDoc(reviewRef(auth("mentor"), "mentor", "self"), review()));
  await assertFails(setDoc(reviewRef(auth("mentor2"), "mentor", "peer"), review("mentor2")));
  await assertFails(setDoc(reviewRef(auth("mentor"), "director", "faculty"), review()));
  await assertFails(setDoc(reviewRef(auth("mentor"), "mentee", "impersonate"), review("director")));
  await assertFails(setDoc(reviewRef(auth("mentor"), "mentee", "void"), review("mentor", { status: "voided", score: 0, verdicts: four("incorrect"), reason: "Wrong review" })));
});

test("directors can grade mentor/faculty test attempts privately and void through a new revision", async () => {
  const db = auth("director");
  await assertSucceeds(setDoc(reviewRef(db, "mentor", "director-grade"), review("director")));
  await assertSucceeds(setDoc(reviewRef(db, "director", "private-faculty-grade"), review("director")));
  await assertFails(getDoc(reviewRef(auth("mentor"), "director", "private-faculty-grade")));
  await assertFails(getDoc(reviewRef(auth("mentee"), "director", "private-faculty-grade")));
  await assertSucceeds(setDoc(reviewRef(db, "mentee", "void-review"), review("director", { status: "voided", score: 0, verdicts: four("incorrect"), reason: "Incorrect selection; re-review needed." })));
  await assertFails(setDoc(reviewRef(db, "mentee", "empty-void-reason"), review("director", { status: "voided", score: 0, verdicts: four("incorrect"), reason: "" })));
});

test("reviews enforce score/verdict consistency and all field bounds/types", async () => {
  const mutations = [
    { score: 4 }, { score: -1 }, { score: 5 }, { score: "2" },
    { verdicts: four("pending") }, { verdicts: { q1: "correct" } },
    { feedback: four("x".repeat(1001)) }, { feedback: four(2) },
    { practiceTasks: four("x".repeat(1501)) }, { practiceTasks: { ...four("task"), q5: "extra" } },
    { summary: "x".repeat(1501) }, { reason: "x".repeat(501) },
    { reviewerName: "Wrong person" }, { reviewerId: "director" },
    { createdAt: Timestamp.fromMillis(1) }, { status: "pending" }, { extra: true },
  ];
  for (let i = 0; i < mutations.length; i++) {
    await assertFails(setDoc(reviewRef(auth("mentor"), "mentee", `bad-${i}`), review("mentor", mutations[i])));
  }
});

test("orphaned reviews and missing-key grading are denied", async () => {
  await assertFails(setDoc(reviewRef(auth("mentor"), "mentee", "orphan", "missing-attempt"), review()));
  const db = auth("director");
  await assertSucceeds(setDoc(doc(db, "knowledgeBanks", "kc-no-guide_v1"), bank({ bankId: "kc-no-guide" })));
  await assertFails(setDoc(attemptRef(auth("mentee"), "mentee", "no-guide"), submission("mentee", { bankId: "kc-no-guide", bankKey: "kc-no-guide_v1" })));
  // A hypothetical old/migrated attempt still cannot be graded without a key.
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(attemptRef(context.firestore(), "mentee", "no-guide"), submission("mentee", { bankId: "kc-no-guide", bankKey: "kc-no-guide_v1" }));
  });
  await assertFails(setDoc(reviewRef(auth("mentor"), "mentee", "missing-guide", "no-guide"), review()));
});

test("incorrect verdicts require nonblank learner feedback and follow-up practice", async () => {
  for (const id of ["q1", "q2", "q3", "q4"]) {
    const incorrect = review("mentor", { verdicts: four("incorrect"), score: 0 });
    for (const blank of ["", " ", "\n\t \n"]) {
      await assertFails(setDoc(reviewRef(auth("mentor"), "mentee", `no-feedback-${id}-${blank.length}`), { ...incorrect, feedback: { ...incorrect.feedback, [id]: blank } }));
      await assertFails(setDoc(reviewRef(auth("mentor"), "mentee", `no-task-${id}-${blank.length}`), { ...incorrect, practiceTasks: { ...incorrect.practiceTasks, [id]: blank } }));
    }
  }
  await assertSucceeds(setDoc(reviewRef(auth("mentor"), "mentee", "blank-for-correct"), review("mentor", { verdicts: four("correct"), score: 4, feedback: four(""), practiceTasks: four("") })));
  await assertSucceeds(setDoc(reviewRef(auth("mentor"), "mentee", "multiline-feedback"), review("mentor", { feedback: four("Review the topic.\nBring questions."), practiceTasks: four("Try a new example.\nAsk for feedback.") })));
  await assertSucceeds(setDoc(reviewRef(auth("director"), "mentee", "blank-on-void"), review("director", { status: "voided", score: 0, verdicts: four("incorrect"), feedback: four(""), practiceTasks: four(""), reason: "An invalid review was withdrawn." })));
});

test("all 30 real catalog banks publish with private guides through atomic two-write batches", async () => {
  const catalogs = await Promise.all(["onboarding", "design", "production"].map(async (name) => JSON.parse(await readFile(new URL(`../app/knowledge-banks/${name}.json`, import.meta.url), "utf8"))));
  const definitions = catalogs.flat();
  assert.equal(definitions.length, 30);
  assert.equal(new Set(definitions.map((item) => item.id)).size, 30);
  for (const definition of definitions) {
    const db = auth("director");
    const key = `${definition.id}_v${definition.version}`;
    const questions = Object.fromEntries(definition.questions.map(({ id, prompt, topic }) => [id, { prompt, topic }]));
    const batch = writeBatch(db);
    batch.set(doc(db, "knowledgeBanks", key), bank({
      bankId: definition.id, version: definition.version, title: definition.title,
      skillIds: definition.skillIds, sourceUrl: definition.sourceUrl, scope: definition.scope, questions,
    }));
    batch.set(doc(db, "knowledgeGuides", key), guide({ bankId: definition.id, version: definition.version }));
    await assertSucceeds(batch.commit());
    const published = await assertSucceeds(getDoc(doc(auth("mentee"), "knowledgeBanks", key)));
    assert.equal(published.data().title, definition.title);
    await assertFails(getDoc(doc(auth("mentee"), "knowledgeGuides", key)));
    await assertSucceeds(getDoc(doc(auth("mentor"), "knowledgeGuides", key)));
  }
});

test("role snapshot cannot expose faculty history when authoritative role changes", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "users", "mentee2"), { role: "director" });
  });
  await assertFails(getDoc(attemptRef(auth("mentor"), "mentee2")));
  await assertFails(setDoc(reviewRef(auth("mentor"), "mentee2", "after-promotion"), review()));
  await assertSucceeds(getDoc(attemptRef(auth("director"), "mentee2")));
});

test("former faculty and mentor attempts remain private even after becoming a mentee", async () => {
  for (const name of ["director2", "mentor2"]) {
    await assertSucceeds(setDoc(attemptRef(auth(name), name), submission(name)));
    await assertSucceeds(setDoc(reviewRef(auth("director"), name, "before-role-change"), review("director")));
    await environment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "users", name), { role: "mentee" });
    });
    await assertFails(getDoc(attemptRef(auth("mentor"), name)));
    await assertFails(getDoc(reviewRef(auth("mentor"), name, "before-role-change")));
    await assertFails(setDoc(reviewRef(auth("mentor"), name, "after-role-change"), review("mentor")));
    const filtered = query(collection(auth("mentor"), "knowledgeAttempts", name, "submissions"), where("ownerRole", "==", "mentee"));
    const visible = await assertSucceeds(getDocs(filtered));
    assert.equal(visible.size, 0);
    await assertSucceeds(getDoc(attemptRef(auth(name), name)));
    await assertSucceeds(getDoc(attemptRef(auth("director"), name)));
    await assertSucceeds(setDoc(attemptRef(auth(name), name, "new-mentee-attempt"), submission(name, { ownerRole: "mentee" })));
    await assertSucceeds(getDoc(attemptRef(auth("mentor"), name, "new-mentee-attempt")));
  }
});
