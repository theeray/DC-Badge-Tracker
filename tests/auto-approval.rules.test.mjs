import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";

// A separate test project isolates setup/cleanup from the existing parallel suites.
const projectId = "digital-corps-autoapproval-rules-test";
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
let environment;
let nextId = 0;
const identity = (email, verified = true) => ({ uid: `auto-account-${++nextId}`, email, verified });
const auth = (person) => environment.authenticatedContext(person.uid, { email: person.email, email_verified: person.verified }).firestore();
const profile = (person, overrides = {}) => ({ displayName: "New student", email: person.email.toLowerCase(), role: "mentee", active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides });
const profileRef = (db, person) => doc(db, "users", person.uid);
const privilegedSeed = async (path, value) => environment.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), ...path), value));
const approve = async (person, role = "mentee", active = true) => privilegedSeed(["approvedUsers", person.email.toLowerCase()], { email: person.email.toLowerCase(), displayName: "Approved member", role, active });

before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(new URL("../firebase/firestore.rules", import.meta.url), "utf8") } });
  await environment.clearFirestore();
});
after(async () => environment?.cleanup());

for (const domain of ["live.bemidjistate.edu", "go.minnstate.edu"]) {
  test(`verified exact ${domain} can bootstrap only its own mentee profile without manual approval`, async () => {
    const person = identity(`new.student+test@${domain}`);
    const db = auth(person);
    const missing = await assertSucceeds(getDoc(profileRef(db, person)));
    assert.equal(missing.exists(), false);
    await assertSucceeds(setDoc(profileRef(db, person), profile(person)));
    assert.equal((await assertSucceeds(getDoc(profileRef(db, person)))).data().role, "mentee");
    await assertFails(getDoc(doc(db, "users", "someone-else")));
    await assertFails(getDocs(collection(db, "users")));
    await assertFails(setDoc(doc(db, "approvedUsers", person.email), { email: person.email, displayName: "Self", role: "director", active: true }));
  });
  test(`unverified ${domain} is not automatically admitted`, async () => {
    const person = identity(`unverified@${domain}`, false);
    await assertFails(getDoc(profileRef(auth(person), person)));
    await assertFails(setDoc(profileRef(auth(person), person), profile(person)));
  });
}

test("exact-domain comparison normalizes auth email case while storing canonical email", async () => {
  const person = identity("Case.Student@LIVE.BEMIDJISTATE.EDU");
  const db = auth(person);
  await assertSucceeds(getDoc(doc(db, "approvedUsers", person.email.toLowerCase())));
  await assertSucceeds(setDoc(profileRef(db, person), profile(person)));
  assert.equal((await getDoc(profileRef(db, person))).data().email, person.email.toLowerCase());
});

for (const email of [
  "student@bemidjistate.edu", "student@gmail.com", "student@my.anokaramsey.edu",
  "student@go.minnesota.edu", "student@notlive.bemidjistate.edu", "student@sub.live.bemidjistate.edu",
  "student@live.bemidjistate.edu.attacker.test", "student@go.minnstate.edu.attacker.test",
  "student@sub.go.minnstate.edu", "student@@live.bemidjistate.edu", "@live.bemidjistate.edu",
  "student @live.bemidjistate.edu", "student\n@go.minnstate.edu", "student@go-minnstate.edu",
]) {
  test(`unapproved outside or spoofed email is denied: ${JSON.stringify(email)}`, async () => {
    const person = identity(email);
    await assertFails(getDoc(profileRef(auth(person), person)));
    await assertFails(setDoc(profileRef(auth(person), person), profile(person)));
  });
}

test("unauthenticated requests cannot bootstrap or list any account", async () => {
  const person = identity("anonymous@live.bemidjistate.edu");
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(profileRef(db, person)));
  await assertFails(getDocs(collection(db, "users")));
  await assertFails(setDoc(profileRef(db, person), profile(person)));
});

for (const role of ["mentor", "director", "admin", "Mentee"]) {
  test(`automatic admission cannot self-select ${role}`, async () => {
    const person = identity(`role-${role.toLowerCase()}@live.bemidjistate.edu`);
    await assertFails(setDoc(profileRef(auth(person), person), profile(person, { role })));
  });
}

test("automatic admission cannot spoof UID, stored email, or active flag", async () => {
  const person = identity("bound-identity@go.minnstate.edu");
  const db = auth(person);
  await assertFails(setDoc(doc(db, "users", "different-uid"), profile(person)));
  await assertFails(setDoc(profileRef(db, person), profile(person, { email: "different@go.minnstate.edu" })));
  await assertFails(setDoc(profileRef(db, person), profile(person, { active: false })));
  await assertFails(setDoc(profileRef(db, person), profile(person, { active: "true" })));
});

test("new accounts enforce all six fields, schema, names and server timestamps", async () => {
  const cases = [
    { extra: true }, { displayName: "" }, { displayName: "   " }, { displayName: "x".repeat(161) },
    { displayName: 7 }, { email: "x".repeat(255) }, { email: 5 },
    { createdAt: Timestamp.fromMillis(0) }, { updatedAt: Timestamp.fromMillis(0) },
    { createdAt: "today" }, { updatedAt: "today" },
  ];
  for (const overrides of cases) {
    const person = identity(`schema-${++nextId}@live.bemidjistate.edu`);
    await assertFails(setDoc(profileRef(auth(person), person), profile(person, overrides)));
  }
  for (const key of ["displayName", "email", "role", "active", "createdAt", "updatedAt"]) {
    const person = identity(`missing-${key}@go.minnstate.edu`);
    const data = profile(person);
    delete data[key];
    await assertFails(setDoc(profileRef(auth(person), person), data));
  }
});

for (const domain of ["live.bemidjistate.edu", "go.minnstate.edu"]) {
  test(`inactive manual approval blocks automatic ${domain} bootstrap`, async () => {
    const person = identity(`paused@${domain}`);
    await approve(person, "mentee", false);
    const db = auth(person);
    await assertSucceeds(getDoc(doc(db, "approvedUsers", person.email)));
    await assertFails(getDoc(profileRef(db, person)));
    await assertFails(setDoc(profileRef(db, person), profile(person)));
  });
}

for (const role of ["mentee", "mentor", "director"]) {
  test(`active manual ${role} approval still grants its assigned role, including outside domains`, async () => {
    const person = identity(`manual-${role}@example.edu`);
    await approve(person, role);
    const db = auth(person);
    await assertSucceeds(getDoc(profileRef(db, person)));
    if (role !== "mentee") await assertFails(setDoc(profileRef(db, person), profile(person)));
    await assertSucceeds(setDoc(profileRef(db, person), profile(person, { role })));
  });
}

test("manual mentor approval on an automatic domain cannot be bypassed to choose a different role", async () => {
  const person = identity("assigned-mentor@go.minnstate.edu");
  await approve(person, "mentor");
  const db = auth(person);
  await assertFails(setDoc(profileRef(db, person), profile(person)));
  await assertFails(setDoc(profileRef(db, person), profile(person, { role: "director" })));
  await assertSucceeds(setDoc(profileRef(db, person), profile(person, { role: "mentor" })));
});

test("manual approval never bypasses email verification", async () => {
  const person = identity("manual-unverified@live.bemidjistate.edu", false);
  await approve(person, "mentor");
  await assertFails(setDoc(profileRef(auth(person), person), profile(person, { role: "mentor" })));
});

test("automatically activated mentees cannot promote, reactivate, corrupt or overwrite their account", async () => {
  const person = identity("protected-update@go.minnstate.edu");
  const db = auth(person);
  await assertSucceeds(setDoc(profileRef(db, person), profile(person)));
  await assertSucceeds(updateDoc(profileRef(db, person), { displayName: "Updated student", updatedAt: serverTimestamp() }));
  for (const changes of [{ role: "mentor" }, { role: "director" }, { active: false }, { email: "other@go.minnstate.edu" }, { extra: true }, { displayName: 2 }, { displayName: "x".repeat(161) }, { createdAt: Timestamp.fromMillis(0) }, { createdAt: deleteField() }]) {
    await assertFails(updateDoc(profileRef(db, person), { ...changes, updatedAt: serverTimestamp() }));
  }
  await assertFails(setDoc(profileRef(db, person), profile(person, { role: "director" })));
  await assertFails(deleteDoc(profileRef(db, person)));
});

test("director can manage auto-created accounts and pause both activation and future bootstrap", async () => {
  const director = identity("managing-director@example.edu");
  await approve(director, "director");
  const directorDb = auth(director);
  await assertSucceeds(setDoc(profileRef(directorDb, director), profile(director, { role: "director" })));
  const person = identity("managed-auto@live.bemidjistate.edu");
  const db = auth(person);
  await assertSucceeds(setDoc(profileRef(db, person), profile(person)));
  for (const invalidChanges of [{ email: deleteField() }, { displayName: "" }, { extra: true }, { role: "admin" }, { active: "false" }, { createdAt: Timestamp.fromMillis(0) }]) {
    await assertFails(updateDoc(profileRef(directorDb, person), { ...invalidChanges, updatedAt: serverTimestamp() }));
  }
  await assertSucceeds(updateDoc(profileRef(directorDb, person), { active: false, updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(directorDb, "approvedUsers", person.email), { email: person.email, displayName: "Paused student", role: "mentee", active: false }));
  await assertFails(updateDoc(profileRef(db, person), { active: true, updatedAt: serverTimestamp() }));
  const recreated = identity(person.email);
  await assertFails(setDoc(profileRef(auth(recreated), recreated), profile(recreated)));
});

test("timestamp-less existing mentor and director profiles retain their roles and admin updates", async () => {
  const director = identity("legacy-director@example.edu");
  const mentor = identity("legacy-mentor@live.bemidjistate.edu");
  for (const [person, role] of [[director, "director"], [mentor, "mentor"]]) {
    await approve(person, role);
    await privilegedSeed(["users", person.uid], { displayName: "Existing member", email: person.email, role, active: true });
  }
  const directorDb = auth(director);
  const mentorDb = auth(mentor);
  assert.equal((await assertSucceeds(getDoc(profileRef(mentorDb, mentor)))).data().role, "mentor");
  await assertSucceeds(updateDoc(profileRef(mentorDb, mentor), { displayName: "Existing mentor", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(profileRef(directorDb, mentor), { active: false, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(profileRef(directorDb, mentor), { active: true, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(profileRef(mentorDb, mentor), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  assert.equal((await getDoc(profileRef(directorDb, director))).data().role, "director");
  // Existing role-specific listing queries retain their original staff access.
  await assertSucceeds(getDocs(query(collection(mentorDb, "users"), where("active", "==", true))));
});

for (const withCreationTimestamp of [false, true]) {
  test(`legacy extra fields survive permitted updates and remain immutable (createdAt=${withCreationTimestamp})`, async () => {
    const director = identity(`legacy-extra-director-${withCreationTimestamp}@example.edu`);
    const mentor = identity(`legacy-extra-mentor-${withCreationTimestamp}@live.bemidjistate.edu`);
    await approve(director, "director");
    await privilegedSeed(["users", director.uid], { displayName: "Legacy director", email: director.email, role: "director", active: true });
    await approve(mentor, "mentor");
    const legacy = { displayName: "Legacy mentor", email: mentor.email, role: "mentor", active: true, importVersion: "pre-beta", legacyMetadata: { retained: true }, ...(withCreationTimestamp ? { createdAt: Timestamp.fromMillis(0) } : {}) };
    await privilegedSeed(["users", mentor.uid], legacy);
    const directorDb = auth(director);
    const mentorDb = auth(mentor);
    await assertSucceeds(updateDoc(profileRef(mentorDb, mentor), { displayName: "Renamed mentor", updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(profileRef(directorDb, mentor), { active: false, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(profileRef(directorDb, mentor), { active: true, role: "mentee", updatedAt: serverTimestamp() }));
    const saved = (await getDoc(profileRef(directorDb, mentor))).data();
    assert.equal(saved.importVersion, "pre-beta");
    assert.deepEqual(saved.legacyMetadata, { retained: true });
    assert.equal(Object.hasOwn(saved, "createdAt"), withCreationTimestamp);
    for (const db of [mentorDb, directorDb]) {
      for (const invalid of [{ extra: true }, { importVersion: "new" }, { importVersion: deleteField() }, { legacyMetadata: { retained: false } }, { legacyMetadata: deleteField() }]) {
        await assertFails(updateDoc(profileRef(db, mentor), { ...invalid, updatedAt: serverTimestamp() }));
      }
    }
  });
}
