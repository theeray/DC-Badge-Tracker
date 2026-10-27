import {
  collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, where, writeBatch, type DocumentData,
} from "firebase/firestore";
import { db, readableFirebaseError, watchAllUsers, watchMentees, type AppRole, type UserProfile } from "./firebase";
import {
  bankKey, boundedText, exactKeys, isRecord, knowledgeBanks, knowledgeScore,
  questionIds, validKnowledgeBank, type KnowledgeBank, type QuestionId, type QuestionValues,
} from "./knowledge-catalog";

export type KnowledgeAttempt = {
  id: string;
  ownerId: string;
  ownerRole: AppRole;
  bankKey: string;
  bankId: string;
  version: number;
  skillId: string;
  answers: QuestionValues<string>;
  createdAt: Date | null;
};
export type KnowledgeReviewDraft = {
  verdicts: QuestionValues<"correct" | "incorrect">;
  feedback: QuestionValues<string>;
  practiceTasks: QuestionValues<string>;
  summary: string;
  score: number;
  status: "graded" | "voided";
  reason: string;
};
export type KnowledgeReview = KnowledgeReviewDraft & {
  id: string;
  reviewerId: string;
  reviewerName: string;
  createdAt: Date | null;
};
export type KnowledgeGuideQuestion = {
  expectedAnswer: string;
  explanation: string;
  studentFeedback: string;
  practiceTask: string;
};
export type KnowledgeGuide = {
  bankId: string;
  version: number;
  questions: QuestionValues<KnowledgeGuideQuestion>;
};

function asDate(value: unknown): Date | null {
  return value && typeof value === "object" && "toDate" in value
    && typeof value.toDate === "function" ? value.toDate() : null;
}

function bankFromDocument(data: DocumentData): KnowledgeBank {
  const bank = {
    id: data.bankId, version: data.version, title: data.title, skillIds: data.skillIds,
    sourceUrl: data.sourceUrl, scope: data.scope,
    questions: questionIds.map((id) => ({ id, ...data.questions[id] })),
  };
  if (!validKnowledgeBank(bank)) throw new Error("A published knowledge check has an invalid definition. Ask a director to review setup.");
  return bank;
}

function attemptsCollection(ownerId: string) {
  return collection(db, "knowledgeAttempts", ownerId, "submissions");
}

export function watchPublishedBanks(onChange: (banks: KnowledgeBank[]) => void, onError: (error: string) => void) {
  return onSnapshot(collection(db, "knowledgeBanks"), (snapshot) => {
    try { onChange(snapshot.docs.map((item) => bankFromDocument(item.data()))); }
    catch (error) { onError(readableFirebaseError(error)); }
  }, (error) => onError(readableFirebaseError(error)));
}

export function watchKnowledgeAttempts(ownerId: string, onChange: (attempts: KnowledgeAttempt[]) => void, onError: (error: string) => void, viewerRole?: AppRole) {
  // Historical faculty/mentor test attempts remain private after role changes.
  // Equality-only reviewer queries need no new composite index.
  const source = viewerRole === "mentor"
    ? query(attemptsCollection(ownerId), where("ownerRole", "==", "mentee"))
    : query(attemptsCollection(ownerId), orderBy("createdAt", "desc"));
  return onSnapshot(source, (snapshot) => {
    onChange(snapshot.docs.map((item) => {
      const data = item.data();
      return { ...data, id: item.id, createdAt: asDate(data.createdAt) } as KnowledgeAttempt;
    }).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || b.id.localeCompare(a.id)));
  }, (error) => onError(readableFirebaseError(error)));
}

export function watchKnowledgeReviews(ownerId: string, attemptId: string, onChange: (reviews: KnowledgeReview[]) => void, onError: (error: string) => void) {
  return onSnapshot(query(collection(db, "knowledgeAttempts", ownerId, "submissions", attemptId, "reviews"), orderBy("createdAt", "desc")), (snapshot) => {
    onChange(snapshot.docs.map((item) => {
      const data = item.data();
      return { ...data, id: item.id, createdAt: asDate(data.createdAt) } as KnowledgeReview;
    }));
  }, (error) => onError(readableFirebaseError(error)));
}

export function watchReviewableMembers(profile: UserProfile, onChange: (members: UserProfile[]) => void, onError: (error: string) => void) {
  if (profile.role === "mentor") return watchMentees(onChange, onError);
  if (profile.role === "director") return watchAllUsers((members) => onChange(members.filter((member) => member.active)), onError);
  onChange([]);
  return () => undefined;
}

export async function submitKnowledgeAttempt(profile: UserProfile, bank: KnowledgeBank, skillId: string, answers: QuestionValues<string>) {
  if (!profile.active || !bank.skillIds.includes(skillId)) throw new Error("Choose an active knowledge check for this tutorial.");
  if (!isRecord(answers) || !exactKeys(answers, questionIds)
    || !questionIds.every((id) => boundedText(answers[id], 2000))) throw new Error("Answer all four questions (up to 2,000 characters each).");
  const reference = doc(attemptsCollection(profile.uid));
  await setDoc(reference, {
    ownerId: profile.uid, ownerRole: profile.role,
    bankKey: bankKey(bank), bankId: bank.id, version: bank.version,
    skillId, answers: Object.fromEntries(questionIds.map((id) => [id, answers[id].trim()])),
    createdAt: serverTimestamp(),
  });
  return reference.id;
}

export async function fetchKnowledgeGuide(key: string): Promise<KnowledgeGuide> {
  // Deliberately called only by the reviewer UI, never the taking/history UI.
  const snapshot = await getDoc(doc(db, "knowledgeGuides", key));
  if (!snapshot.exists()) throw new Error("The private grading guide is not installed. A director must import the guide file before grading.");
  const data = snapshot.data();
  const guide = { bankId: data.bankId, version: data.version, questions: data.questions };
  if (!validKnowledgeGuide(guide)) throw new Error("The grading guide is invalid. Contact a director.");
  return guide;
}

export async function saveKnowledgeReview(profile: UserProfile, ownerId: string, attemptId: string, draft: KnowledgeReviewDraft, expectedLatestReviewId: string | null) {
  if (profile.role === "mentee" || (profile.role === "mentor" && ownerId === profile.uid)) throw new Error("A different mentor or director must grade this attempt.");
  const fields = ["verdicts", "feedback", "practiceTasks"] as const;
  if (!fields.every((field) => isRecord(draft[field]) && exactKeys(draft[field], questionIds))
    || !questionIds.every((id) => ["correct", "incorrect"].includes(draft.verdicts[id])
      && boundedText(draft.feedback[id], 1000, true) && boundedText(draft.practiceTasks[id], 1500, true))
    || !boundedText(draft.summary, 1500, true)
    || !["graded", "voided"].includes(draft.status)
    || !boundedText(draft.reason, 500, draft.status === "graded")) throw new Error("Complete all four grading decisions and keep feedback within the displayed limits.");
  if (draft.status === "voided" && profile.role !== "director") throw new Error("Only a director can withdraw a review.");
  if (draft.status === "graded" && questionIds.some((id) => draft.verdicts[id] === "incorrect"
    && (!draft.feedback[id].trim() || !draft.practiceTasks[id].trim()))) {
    throw new Error("Add feedback and a practice task for every question that needs practice.");
  }
  const reviews = collection(db, "knowledgeAttempts", ownerId, "submissions", attemptId, "reviews");
  // Best-effort conflict warning; append-only writes preserve both reviews even
  // if two reviewers submit concurrently. Nothing is overwritten or erased.
  const latest = await getDocs(query(reviews, orderBy("createdAt", "desc"), limit(1)));
  if ((latest.docs[0]?.id ?? null) !== expectedLatestReviewId) throw new Error("Another review was saved while you were grading. Read the latest feedback and try again.");
  const reference = doc(reviews);
  await setDoc(reference, {
    ...draft, score: draft.status === "graded" ? knowledgeScore(draft.verdicts) : 0,
    reviewerId: profile.uid, reviewerName: profile.displayName, createdAt: serverTimestamp(),
  });
  return reference.id;
}

export function validKnowledgeGuide(value: unknown): value is KnowledgeGuide {
  if (!isRecord(value) || !exactKeys(value, ["bankId", "version", "questions"])) return false;
  return boundedText(value.bankId, 80) && /^[a-z0-9-]+$/.test(value.bankId)
    && Number.isInteger(value.version) && Number(value.version) >= 1 && Number(value.version) <= 1000
    && isRecord(value.questions) && exactKeys(value.questions, questionIds)
    && questionIds.every((id: QuestionId) => {
      const item = (value.questions as Record<string, unknown>)[id];
      return isRecord(item) && exactKeys(item, ["expectedAnswer", "explanation", "studentFeedback", "practiceTask"])
        && boundedText(item.expectedAnswer, 3000) && boundedText(item.explanation, 2000)
        && boundedText(item.studentFeedback, 1000) && boundedText(item.practiceTask, 1500);
    });
}

export async function installKnowledgeChecks(fileText: string, profile: UserProfile) {
  if (profile.role !== "director") throw new Error("Only a faculty director can install private grading guides.");
  if (fileText.length > 1_000_000) throw new Error("Choose the DC Central grading-guide JSON file (under 1 MB).");
  let parsed: unknown;
  try { parsed = JSON.parse(fileText); } catch { throw new Error("This is not a valid JSON grading-guide file."); }
  if (!isRecord(parsed) || !exactKeys(parsed, ["schemaVersion", "guides"]) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.guides)
    || parsed.guides.length !== knowledgeBanks.length || !parsed.guides.every(validKnowledgeGuide)) throw new Error("The file must contain all 30 versioned DC Central grading guides.");
  const guides = parsed.guides as KnowledgeGuide[];
  const guideMap = new Map(guides.map((guide) => [`${guide.bankId}_v${guide.version}`, guide]));
  if (guideMap.size !== knowledgeBanks.length || knowledgeBanks.some((bank) => !guideMap.has(bankKey(bank)))) throw new Error("The guide file does not match these 30 knowledge-check versions.");
  const existing = await Promise.all(knowledgeBanks.map(async (bank) => {
    const key = bankKey(bank);
    const [publicSnapshot, privateSnapshot] = await Promise.all([
      getDoc(doc(db, "knowledgeBanks", key)), getDoc(doc(db, "knowledgeGuides", key)),
    ]);
    if (publicSnapshot.exists()) {
      const saved = bankFromDocument(publicSnapshot.data());
      const matching = saved.id === bank.id && saved.version === bank.version
        && saved.title === bank.title && saved.sourceUrl === bank.sourceUrl && saved.scope === bank.scope
        && saved.skillIds.length === bank.skillIds.length && saved.skillIds.every((id, i) => id === bank.skillIds[i])
        && saved.questions.every((item, i) => item.id === bank.questions[i].id
          && item.prompt === bank.questions[i].prompt && item.topic === bank.questions[i].topic);
      if (!matching) throw new Error(`The saved version of ${bank.title} differs. Publish a new version instead of changing old attempts.`);
    }
    if (privateSnapshot.exists()) {
      const data = privateSnapshot.data();
      if (JSON.stringify({ bankId: data.bankId, version: data.version, questions: data.questions }) !== JSON.stringify(guideMap.get(key))) {
        // Compare normalized fixed field order, not Firestore's map key order.
        const saved = { bankId: data.bankId, version: data.version, questions: data.questions };
        const incoming = guideMap.get(key)!;
        if (!validKnowledgeGuide(saved) || questionIds.some((id) =>
          Object.keys(incoming.questions[id]).some((field) => saved.questions[id][field as keyof KnowledgeGuideQuestion] !== incoming.questions[id][field as keyof KnowledgeGuideQuestion]))) {
          throw new Error(`The saved grading guide for ${bank.title} differs. A new version is required; old guides are preserved.`);
        }
      }
    }
    return { bank, publicExists: publicSnapshot.exists(), privateExists: privateSnapshot.exists() };
  }));
  for (const { bank, publicExists, privateExists } of existing) {
    // Each guide's getAfter(bank) validation counts toward the rules' 20-read
    // batch budget. One atomic bank/guide pair avoids exceeding that budget.
    // Retrying after interruption skips already-installed immutable versions.
    const batch = writeBatch(db);
    const key = bankKey(bank);
    if (!publicExists) batch.set(doc(db, "knowledgeBanks", key), {
      bankId: bank.id, version: bank.version, title: bank.title, skillIds: bank.skillIds,
      sourceUrl: bank.sourceUrl, scope: bank.scope,
      questions: Object.fromEntries(bank.questions.map(({ id, prompt, topic }) => [id, { prompt, topic }])),
      createdBy: profile.uid, createdAt: serverTimestamp(),
    });
    if (!privateExists) batch.set(doc(db, "knowledgeGuides", key), {
      ...guideMap.get(key)!, createdBy: profile.uid, createdAt: serverTimestamp(),
    });
    if (!publicExists || !privateExists) await batch.commit();
  }
  return knowledgeBanks.length;
}
