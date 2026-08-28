import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
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
  await assertSucceeds(
    updateDoc(doc(directorDb, "users", identities.mentor.uid), {
      active: true,
      updatedAt: serverTimestamp(),
    }),
  );
});

test("student workers can create and correct only their own time entries", async () => {
  const menteeDb = authenticated(identities.mentee);
  const mentorDb = authenticated(identities.mentor);
  const startedAt = Timestamp.fromDate(new Date("2026-08-28T15:00:00Z"));
  const endedAt = Timestamp.fromDate(new Date("2026-08-28T17:00:00Z"));

  await assertSucceeds(
    setDoc(doc(menteeDb, "timeEntries", "mentee-shift"), {
      workerId: identities.mentee.uid,
      workerName: identities.mentee.displayName,
      startedAt,
      endedAt: null,
      note: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    updateDoc(doc(menteeDb, "timeEntries", "mentee-shift"), {
      startedAt,
      endedAt,
      note: "Corrected clock-out",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    getDocs(
      query(
        collection(menteeDb, "timeEntries"),
        where("workerId", "==", identities.mentee.uid),
      ),
    ),
  );

  await assertSucceeds(
    setDoc(doc(mentorDb, "timeEntries", "mentor-shift"), {
      workerId: identities.mentor.uid,
      workerName: identities.mentor.displayName,
      startedAt,
      endedAt,
      note: "Mentor work shift",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(menteeDb, "timeEntries", "forged-mentor-shift"), {
      workerId: identities.mentor.uid,
      workerName: identities.mentor.displayName,
      startedAt,
      endedAt,
      note: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(mentorDb, "timeEntries", "mentee-shift"), {
      startedAt,
      endedAt,
      note: "Not my record",
      updatedAt: serverTimestamp(),
    }),
  );
});

test("director can review and correct student time", async () => {
  const directorDb = authenticated(identities.director);
  await assertSucceeds(
    getDoc(doc(directorDb, "timeEntries", "mentee-shift")),
  );
  await assertSucceeds(
    updateDoc(doc(directorDb, "timeEntries", "mentee-shift"), {
      startedAt: Timestamp.fromDate(new Date("2026-08-28T15:15:00Z")),
      endedAt: Timestamp.fromDate(new Date("2026-08-28T17:00:00Z")),
      note: "Faculty correction",
      updatedAt: serverTimestamp(),
    }),
  );
});

test("only directors manage manual Gold and Silver skill credentials", async () => {
  const directorDb = authenticated(identities.director);
  const mentorDb = authenticated(identities.mentor);
  const credentialId = `${identities.mentor.uid}_camera-skill`;
  const credential = {
    workerId: identities.mentor.uid,
    workerName: identities.mentor.displayName,
    skillId: "camera-skill",
    level: "Gold",
    note: "Can train other student workers",
    awardedBy: identities.director.uid,
    awardedByName: identities.director.displayName,
    updatedAt: serverTimestamp(),
  };

  await assertSucceeds(
    setDoc(doc(directorDb, "skillCredentials", credentialId), credential),
  );
  await assertSucceeds(
    getDoc(doc(mentorDb, "skillCredentials", credentialId)),
  );
  await assertFails(
    setDoc(doc(mentorDb, "skillCredentials", credentialId), {
      ...credential,
      awardedBy: identities.mentor.uid,
      awardedByName: identities.mentor.displayName,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    deleteDoc(doc(mentorDb, "skillCredentials", credentialId)),
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

test("a verified approved account can bootstrap its own profile", async () => {
  const approved = {
    uid: "approved-new-1",
    email: "approved-new@bemidjistate.edu",
    displayName: "Approved New User",
    role: "director",
  };
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "approvedUsers", approved.email), {
      email: approved.email,
      displayName: approved.displayName,
      role: approved.role,
      active: true,
    });
  });

  const approvedDb = environment.authenticatedContext(approved.uid, {
    email: approved.email,
    email_verified: true,
  }).firestore();
  const profileReference = doc(approvedDb, "users", approved.uid);
  await assertSucceeds(getDoc(profileReference));
  await assertSucceeds(
    setDoc(profileReference, {
      displayName: approved.displayName,
      email: approved.email,
      role: approved.role,
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
