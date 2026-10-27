import onboarding from "./knowledge-banks/onboarding.json" with { type: "json" };
import design from "./knowledge-banks/design.json" with { type: "json" };
import production from "./knowledge-banks/production.json" with { type: "json" };

export const questionIds = ["q1", "q2", "q3", "q4"] as const;
export type QuestionId = (typeof questionIds)[number];
export type QuestionValues<T> = Record<QuestionId, T>;
export type KnowledgeBank = {
  id: string;
  title: string;
  version: number;
  skillIds: string[];
  sourceUrl: string;
  scope: string;
  questions: { id: QuestionId; prompt: string; topic: string }[];
};

export function bankKey(bank: Pick<KnowledgeBank, "id" | "version">) {
  return `${bank.id}_v${bank.version}`;
}

export function questionValues<T>(value: T): QuestionValues<T> {
  return { q1: value, q2: value, q3: value, q4: value };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

export function boundedText(value: unknown, max: number, allowBlank = false): value is string {
  return typeof value === "string" && value.length <= max && (allowBlank || value.trim().length > 0);
}

export function validKnowledgeBank(value: unknown): value is KnowledgeBank {
  if (!isRecord(value) || !exactKeys(value, ["id", "title", "version", "skillIds", "sourceUrl", "scope", "questions"])) return false;
  return boundedText(value.id, 80) && /^[a-z0-9-]+$/.test(value.id)
    && boundedText(value.title, 160)
    && Number.isInteger(value.version) && Number(value.version) >= 1 && Number(value.version) <= 1000
    && Array.isArray(value.skillIds) && value.skillIds.length > 0 && value.skillIds.length <= 10
    && value.skillIds.every((id) => boundedText(id, 100)) && new Set(value.skillIds).size === value.skillIds.length
    && boundedText(value.sourceUrl, 1000) && value.sourceUrl.startsWith("https://")
    && boundedText(value.scope, 1600)
    && Array.isArray(value.questions) && value.questions.length === 4
    && questionIds.every((id, index) => {
      const question = (value.questions as unknown[])[index];
      return isRecord(question) && exactKeys(question, ["id", "prompt", "topic"])
        && question.id === id && boundedText(question.prompt, 1000) && boundedText(question.topic, 100);
    });
}

const drafts: unknown[] = [...onboarding, ...design, ...production];
if (!drafts.every(validKnowledgeBank)) throw new Error("A knowledge-check definition is invalid.");
export const knowledgeBanks: KnowledgeBank[] = drafts;

export function getKnowledgeBankForSkill(skillId: string) {
  return knowledgeBanks.find((bank) => bank.skillIds.includes(skillId));
}

export function knowledgeScore(verdicts: QuestionValues<"correct" | "incorrect">) {
  return questionIds.filter((id) => verdicts[id] === "correct").length;
}
