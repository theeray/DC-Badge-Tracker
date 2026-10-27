import assert from "node:assert/strict";
import test from "node:test";
import { allSkills } from "../app/data.ts";
import {
  bankKey,
  boundedText,
  exactKeys,
  getKnowledgeBankForSkill,
  isRecord,
  knowledgeBanks,
  knowledgeScore,
  questionIds,
  questionValues,
  validKnowledgeBank,
} from "../app/knowledge-catalog.ts";

// Frozen coverage approved in the 92-entry source audit. Do not depend on an
// out-of-repository audit file in local tests or GitHub Actions.
const expectedSkillIds = [
  "on-work-study-eligibility", "on-payroll", "on-files", "on-hours",
  "on-primary", "on-meeting", "on-brand", "on-briefs", "on-bsu-brand",
  "on-tad-brand", "on-presentation", "on-costing", "on-make-brief",
  "on-id-spell", "on-headline", "cc-export-pdf", "cc-package-id",
  "cc-poster-design", "cc-mockups", "cc-make-poster", "cc-stickers",
  "cc-scan", "cc-headshots", "cc-lighting", "cc-camera", "cc-gimbal-pair",
  "cc-audio", "cc-video-mockup", "cc-hp-printers", "cc-heat-press",
  "cc-embroidery-machine", "sm-qr", "sm-id-qr", "sm-primary", "sm-meeting",
  "sm-dc-brand", "sm-briefs", "sm-bsu", "sm-tad", "sm-presentation",
  "sm-costing", "sm-make-brief", "lead-primary", "lead-meeting",
];

const forbiddenPublicKeys = new Set([
  "expectedAnswer", "explanation", "studentFeedback", "practiceTask",
  "correctAnswer", "answerKey", "rubric",
]);

function inspectPublicKeys(value, path = "bank") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectPublicKeys(item, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbiddenPublicKeys.has(key), `Private key ${path}.${key} leaked`);
      inspectPublicKeys(child, `${path}.${key}`);
    }
  }
}

const example = () => structuredClone(knowledgeBanks[0]);
const invalidBank = (description, edit) => {
  test(`bank validator rejects ${description}`, () => {
    const bank = example();
    edit(bank);
    assert.equal(validKnowledgeBank(bank), false);
  });
};

test("30 shared banks provide 120 questions across exactly the approved 44 of 92 tutorials", () => {
  assert.equal(allSkills.length, 92);
  assert.equal(knowledgeBanks.length, 30);
  assert.equal(knowledgeBanks.reduce((sum, bank) => sum + bank.questions.length, 0), 120);
  const linked = knowledgeBanks.flatMap((bank) => bank.skillIds);
  assert.equal(linked.length, 44, "A tutorial must not be linked to multiple banks");
  assert.equal(new Set(linked).size, 44);
  assert.deepEqual([...linked].sort(), [...expectedSkillIds].sort());
  for (const id of linked) {
    assert.ok(allSkills.some((skill) => skill.id === id), `Missing tutorial ${id}`);
    assert.ok(getKnowledgeBankForSkill(id)?.skillIds.includes(id));
  }
  assert.equal(getKnowledgeBankForSkill("unknown-skill"), undefined);
  assert.equal(getKnowledgeBankForSkill("on-planner"), undefined);
});

test("all bank IDs, version keys, and ordered question IDs are unique and valid", () => {
  assert.equal(new Set(knowledgeBanks.map((bank) => bank.id)).size, 30);
  assert.equal(new Set(knowledgeBanks.map(bankKey)).size, 30);
  for (const bank of knowledgeBanks) {
    assert.ok(validKnowledgeBank(bank), `${bank.id} failed validation`);
    assert.deepEqual(bank.questions.map((question) => question.id), [...questionIds]);
    assert.equal(new Set(bank.questions.map((question) => question.id)).size, 4);
    assert.equal(new URL(bank.sourceUrl).protocol, "https:");
    assert.match(bankKey(bank), /^kc-[a-z0-9-]+_v[1-9]\d*$/);
  }
});

test("public catalog contains no grading keys or private mentor guidance", () => {
  inspectPublicKeys(knowledgeBanks);
  assert.deepEqual(questionIds, ["q1", "q2", "q3", "q4"]);
});

test("basic record and bounded-text validators reject missing or malformed values", () => {
  for (const value of [null, undefined, [], "text", 1, true]) {
    assert.equal(isRecord(value), false);
    assert.equal(validKnowledgeBank(value), false);
  }
  assert.equal(isRecord({}), true);
  assert.equal(exactKeys({ a: 1, b: 2 }, ["a", "b"]), true);
  assert.equal(exactKeys({ a: 1, b: 2, c: 3 }, ["a", "b"]), false);
  assert.equal(exactKeys({ a: 1 }, ["a", "b"]), false);
  assert.equal(boundedText("abc", 3), true);
  assert.equal(boundedText("abcd", 3), false);
  assert.equal(boundedText("  ", 3), false);
  assert.equal(boundedText("", 3, true), true);
  assert.equal(boundedText(123, 3), false);
});

for (const key of ["id", "title", "version", "skillIds", "sourceUrl", "scope", "questions"]) {
  invalidBank(`a missing required ${key}`, (bank) => { delete bank[key]; });
}
for (const key of forbiddenPublicKeys) {
  invalidBank(`private top-level ${key}`, (bank) => { bank[key] = "must stay private"; });
  invalidBank(`private question-level ${key}`, (bank) => { bank.questions[0][key] = "must stay private"; });
}
invalidBank("an unknown top-level field", (bank) => { bank.unexpected = true; });
invalidBank("an unknown question field", (bank) => { bank.questions[0].unexpected = true; });
invalidBank("an empty ID", (bank) => { bank.id = ""; });
invalidBank("an oversized ID", (bank) => { bank.id = "a".repeat(81); });
invalidBank("an unsafe ID", (bank) => { bank.id = "../private"; });
invalidBank("a blank title", (bank) => { bank.title = "  "; });
invalidBank("an oversized title", (bank) => { bank.title = "x".repeat(161); });
invalidBank("an object title", (bank) => { bank.title = {}; });
invalidBank("version zero", (bank) => { bank.version = 0; });
invalidBank("a negative version", (bank) => { bank.version = -1; });
invalidBank("a fractional version", (bank) => { bank.version = 1.5; });
invalidBank("a string version", (bank) => { bank.version = "1"; });
invalidBank("an oversized version", (bank) => { bank.version = 1001; });
invalidBank("no linked skills", (bank) => { bank.skillIds = []; });
invalidBank("an oversized skills list", (bank) => { bank.skillIds = Array.from({ length: 11 }, (_, i) => `skill-${i}`); });
invalidBank("duplicate linked skills", (bank) => { bank.skillIds = ["same", "same"]; });
invalidBank("a non-string linked skill", (bank) => { bank.skillIds = [1]; });
invalidBank("a blank linked skill", (bank) => { bank.skillIds = [" "]; });
invalidBank("an oversized linked skill", (bank) => { bank.skillIds = ["x".repeat(101)]; });
invalidBank("a non-array skills value", (bank) => { bank.skillIds = {}; });
invalidBank("an insecure source URL", (bank) => { bank.sourceUrl = "http://example.com"; });
invalidBank("an oversized source URL", (bank) => { bank.sourceUrl = `https://${"x".repeat(1000)}`; });
invalidBank("a blank scope", (bank) => { bank.scope = " "; });
invalidBank("an oversized scope", (bank) => { bank.scope = "x".repeat(1601); });
invalidBank("too few questions", (bank) => { bank.questions.pop(); });
invalidBank("too many questions", (bank) => { bank.questions.push({ id: "q5", prompt: "Extra?", topic: "Extra" }); });
invalidBank("a non-array questions value", (bank) => { bank.questions = {}; });
invalidBank("question reordering", (bank) => { [bank.questions[0], bank.questions[1]] = [bank.questions[1], bank.questions[0]]; });
invalidBank("a duplicate question ID", (bank) => { bank.questions[1].id = "q1"; });
invalidBank("an unknown question ID", (bank) => { bank.questions[0].id = "q9"; });
invalidBank("a null question", (bank) => { bank.questions[0] = null; });
invalidBank("a blank prompt", (bank) => { bank.questions[0].prompt = "  "; });
invalidBank("an oversized prompt", (bank) => { bank.questions[0].prompt = "x".repeat(1001); });
invalidBank("a non-string prompt", (bank) => { bank.questions[0].prompt = []; });
invalidBank("a blank topic", (bank) => { bank.questions[0].topic = "  "; });
invalidBank("an oversized topic", (bank) => { bank.questions[0].topic = "x".repeat(101); });
invalidBank("a non-string topic", (bank) => { bank.questions[0].topic = 4; });

test("question helpers retain four distinct slots and calculate every possible correct count", () => {
  assert.deepEqual(questionValues(""), { q1: "", q2: "", q3: "", q4: "" });
  for (let correctCount = 0; correctCount <= 4; correctCount += 1) {
    const verdicts = questionValues("incorrect");
    for (let index = 0; index < correctCount; index += 1) verdicts[questionIds[index]] = "correct";
    assert.equal(knowledgeScore(verdicts), correctCount);
  }
  const first = questionValues("incorrect");
  const second = questionValues("incorrect");
  first.q1 = "correct";
  assert.equal(second.q1, "incorrect");
});
