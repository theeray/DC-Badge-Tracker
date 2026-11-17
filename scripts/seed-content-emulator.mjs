import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { fileURLToPath } from "node:url";

// Hardcoded demo project and loopback hosts deliberately have no CLI/env
// overrides. This utility cannot seed a real Firebase project.
const projectId = "demo-dc-central-content";
const authHost = "127.0.0.1:9098";
const firestoreHost = "127.0.0.1:8085";
const apiKey = "demo-dc-central-content-api-key";
const localFixturePassword = "Local-content-demo-only-2026!";
if (!projectId.startsWith("demo-")
  || (process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST !== authHost)
  || (process.env.FIRESTORE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST !== firestoreHost)
  || (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.length > 2)) {
  throw new Error("Refusing to seed anything except the fixed isolated local demo emulators.");
}

async function authRequest(operation, body, administrative = false) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/${operation}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(administrative ? { Authorization: "Bearer owner" } : {}) },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(`Local Auth emulator rejected ${operation}: ${data.error?.message ?? response.status}`);
    error.code = data.error?.message;
    throw error;
  }
  return data;
}

const fixtures = [
  { role: "director", displayName: "Demo Faculty Director", email: "director@dc-central.invalid" },
  { role: "mentee", displayName: "Demo Mentee", email: "mentee@dc-central.invalid" },
];
const users = [];
for (const fixture of fixtures) {
  let credential;
  try {
    credential = await authRequest("accounts:signUp", { email: fixture.email, password: localFixturePassword, returnSecureToken: true });
  } catch (error) {
    if (error.code !== "EMAIL_EXISTS") throw error;
    credential = await authRequest("accounts:signInWithPassword", { email: fixture.email, password: localFixturePassword, returnSecureToken: true });
  }
  await authRequest("accounts:update", { localId: credential.localId, displayName: fixture.displayName, emailVerified: true }, true);
  users.push({ ...fixture, uid: credential.localId });
}

const environment = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 8085 } });
try {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const user of users) {
      await setDoc(doc(db, "users", user.uid), {
        displayName: user.displayName, email: user.email, role: user.role, active: true,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }, { merge: true });
      await setDoc(doc(db, "approvedUsers", user.email), {
        displayName: user.displayName, email: user.email, role: user.role, active: true, updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    const bankReference = doc(db, "knowledgeBanks", "kc-demo-headshots_v1");
    if (!(await getDoc(bankReference)).exists()) {
      const director = users.find((user) => user.role === "director");
      const base = { bankId: "kc-demo-headshots", version: 1, createdBy: director.uid, createdAt: serverTimestamp() };
      await setDoc(bankReference, {
        ...base, title: "Demo headshot knowledge check", skillIds: ["cc-headshots"], sourceUrl: "https://example.org/demo-headshots",
        scope: "Isolated local QA fixture. This is not a real student lesson.",
        questions: Object.fromEntries(["q1", "q2", "q3", "q4"].map((id, index) => [id, { prompt: `Demo question ${index + 1}: explain a preparation step.`, topic: `Demo topic ${index + 1}` }])),
      });
      await setDoc(doc(db, "knowledgeGuides", "kc-demo-headshots_v1"), {
        ...base,
        questions: Object.fromEntries(["q1", "q2", "q3", "q4"].map((id) => [id, {
          expectedAnswer: "This is a synthetic demo answer, not an actual lesson answer key.",
          explanation: "Use this fixture only to verify the local authoring and review interface.",
          studentFeedback: "Review the demo preparation step and explain your reasoning.",
          practiceTask: "Describe a practice step to the demo mentor.",
        }])),
      });
      await setDoc(doc(db, "knowledgeCatalog", "kc-demo-headshots"), {
        bankId: "kc-demo-headshots", archived: false, revision: 1, updatedBy: director.uid, updatedAt: serverTimestamp(),
      });
    }
  });
} finally {
  await environment.cleanup();
}
console.log("Seeded two synthetic verified accounts and one demo check in the isolated local emulators. No live Firebase data was accessed.");
