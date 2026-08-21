import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const invitePath = process.env.FIREBASE_INVITES_FILE ?? "firebase/private-invites.json";
const roles = new Set(["student", "mentor", "director"]);

if (!projectId) {
  throw new Error("Set FIREBASE_PROJECT_ID before provisioning accounts.");
}

const invites = JSON.parse(await readFile(invitePath, "utf8"));
if (!Array.isArray(invites) || invites.length === 0) {
  throw new Error("The private invite file must contain at least one account.");
}

for (const invite of invites) {
  if (
    typeof invite.displayName !== "string" ||
    typeof invite.email !== "string" ||
    typeof invite.title !== "string" ||
    !roles.has(invite.role)
  ) {
    throw new Error("Every invite needs displayName, email, title, and a valid role.");
  }
}

const app = getApps().length
  ? getApps()[0]
  : initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth(app);
const database = getFirestore(app);

for (const invite of invites) {
  const email = invite.email.trim().toLowerCase();
  let user;
  let action = "updated";

  try {
    user = await auth.getUserByEmail(email);
    user = await auth.updateUser(user.uid, {
      displayName: invite.displayName,
      disabled: false,
    });
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    user = await auth.createUser({
      email,
      displayName: invite.displayName,
      emailVerified: false,
      password: randomBytes(32).toString("base64url"),
      disabled: false,
    });
    action = "created";
  }

  await database.doc(`profiles/${user.uid}`).set({
    displayName: invite.displayName,
    role: invite.role,
    title: invite.title,
    active: true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`${action}: ${invite.displayName} (${invite.role})`);
}

console.log("Provisioning complete. Users can choose ‘Set or reset password’ on the site.");
