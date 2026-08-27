import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const projectId = "digital-corps-badge-tracker-rules-test";
const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const [emulatorHost, emulatorPort] = host.split(":");
let environment;

const identities = {
  director: {
    uid: "director-1",
    email: "director@bemidjistate.edu",
    role: "director",
    displayName: "Faculty Director",
  },
  mentor: {
    uid: "mentor-1",
    email: "mentor@my.rctc.edu",
    role: "mentor",
    displayName: "Student Mentor",
  },
  mentee: {
    uid: "mentee-1",
    email: "mentee@live.bemidjistate.edu",
    role: "mentee",
    displayName: "Student Mentee",
  },
};

function authenticated(identity) {
  return environment.authenticatedContext(identity.uid, {
    email: identity.email,
    email_verified: true,
  }).firestore();
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: emulatorHost,
      port: Number(emulatorPort),
      rules: await readFile(
        new URL("../firebase/firestore.rules", import.meta.url),
        "utf8",
      ),
    },
  });

  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    for (const identity of Object.values(identities)) {
      await setDoc(doc(firestore, "approvedUsers", identity.email), {
        email: identity.email,
        displayName: identity.displayName,
        role: identity.role,
        active: true,
      });
      await setDoc(doc(firestore, "users", identity.uid), {
        displayName: identity.displayName,
        email: identity.email,
        role: identity.role,
        active: true,
      });
    }
    await setDoc(doc(firestore, "progress", identities.mentee.uid), {
      ownerId: identities.mentee.uid,
      statuses: {
        "ready-skill": "ready",
        "learning-skill": "learning",
      },
    });
  });
});

after(async () => {
  await environment.cleanup();
});

test("mentee can edit only their own progress", async () => {
  const menteeDb = authenticated(identities.mentee);
  await assertSucceeds(
    setDoc(doc(menteeDb, "progress", identities.mentee.uid), {
      ownerId: identities.mentee.uid,
      statuses: { "ready-skill": "complete" },
      updatedAt: serverTimestamp(),
    }),
  );

  const mentorDb = authenticated(identities.mentor);
  await assertFails(
    setDoc(doc(mentorDb, "progress", identities.mentee.uid), {
      ownerId: identities.mentee.uid,
      statuses: { "ready-skill": "complete" },
      updatedAt: serverTimestamp(),
    }),
  );
});

test("mentor can read progress and endorse a ready skill", async () => {
  const mentorDb = authenticated(identities.mentor);
  await assertSucceeds(
    getDoc(doc(mentorDb, "progress", identities.mentee.uid)),
  );
  await assertSucceeds(
    setDoc(doc(mentorDb, "endorsements", "ready-endorsement"), {
      menteeId: identities.mentee.uid,
      skillId: "ready-skill",
      mentorId: identities.mentor.uid,
      mentorName: identities.mentor.displayName,
      createdAt: serverTimestamp(),
    }),
  );
});

test("mentor cannot endorse a skill that is still learning", async () => {
  const mentorDb = authenticated(identities.mentor);
  await assertFails(
    setDoc(doc(mentorDb, "endorsements", "early-endorsement"), {
      menteeId: identities.mentee.uid,
      skillId: "learning-skill",
      mentorId: identities.mentor.uid,
      mentorName: identities.mentor.displayName,
      createdAt: serverTimestamp(),
    }),
  );
});

test("mentee cannot create an endorsement", async () => {
  const menteeDb = authenticated(identities.mentee);
  await assertFails(
    setDoc(doc(menteeDb, "endorsements", "self-endorsement"), {
      menteeId: identities.mentee.uid,
      skillId: "ready-skill",
      mentorId: identities.mentee.uid,
      mentorName: identities.mentee.displayName,
      createdAt: serverTimestamp(),
    }),
  );
});

test("director can administer profiles and progress", async () => {
  const directorDb = authenticated(identities.director);
  await assertSucceeds(
    updateDoc(doc(directorDb, "users", identities.mentor.uid), {
      active: false,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    setDoc(doc(directorDb, "progress", identities.mentee.uid), {
      ownerId: identities.mentee.uid,
      statuses: {},
      updatedAt: serverTimestamp(),
    }),
  );
});

test("an unapproved account cannot create a profile", async () => {
  const unapproved = {
    uid: "unapproved-1",
    email: "not-approved@live.bemidjistate.edu",
  };
  const unapprovedDb = environment.authenticatedContext(unapproved.uid, {
    email: unapproved.email,
    email_verified: true,
  }).firestore();
  await assertFails(
    setDoc(doc(unapprovedDb, "users", unapproved.uid), {
      displayName: "Unapproved User",
      email: unapproved.email,
      role: "mentee",
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
});

test("a member cannot promote their own role", async () => {
  const menteeDb = authenticated(identities.mentee);
  await assertFails(
    updateDoc(doc(menteeDb, "users", identities.mentee.uid), {
      role: "director",
      updatedAt: serverTimestamp(),
    }),
  );
  assert.equal(true, true);
});
