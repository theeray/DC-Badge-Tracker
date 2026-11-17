import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as access from "../app/account-access.ts";

function deferred() {
  let resolve;
  const promise = new Promise((complete) => { resolve = complete; });
  return { promise, resolve };
}

test("automatic admission matches only the two exact normalized email domains", () => {
  for (const address of ["student@live.bemidjistate.edu", "student@go.minnstate.edu", " Student@LIVE.BEMIDJISTATE.EDU "]) {
    assert.equal(access.isAutomaticMenteeEmail(address), true, address);
  }
  for (const address of [
    "student@bemidjistate.edu", "student@gmail.com", "student@go.minnesota.edu",
    "student@sub.live.bemidjistate.edu", "student@live.bemidjistate.edu.example.com",
    "student@evilgo.minnstate.edu", "student@go.minnstate.edu.evil", "@go.minnstate.edu",
    "student@@go.minnstate.edu", "stu dent@go.minnstate.edu", "go.minnstate.edu", "",
  ]) assert.equal(access.isAutomaticMenteeEmail(address), false, address);
});

test("new verified institutional members get only mentee and explicit approvals take precedence", () => {
  for (const address of ["student@live.bemidjistate.edu", "student@go.minnstate.edu"]) {
    assert.equal(access.resolveNewAccountRole(address, true, null), "mentee");
    assert.throws(() => access.resolveNewAccountRole(address, false, null), /verify/i);
    assert.throws(() => access.resolveNewAccountRole(address, true, { role: "mentee", active: false }), /paused/i);
  }
  for (const role of ["mentee", "mentor", "director"]) {
    assert.equal(access.resolveNewAccountRole("approved@example.org", true, { role, active: true }), role);
    assert.throws(() => access.resolveNewAccountRole("approved@example.org", false, { role, active: true }), /verify/i);
  }
  assert.throws(() => access.resolveNewAccountRole("student@gmail.com", true, null), /needs approval/i);
  assert.throws(() => access.resolveNewAccountRole("student@go.minnstate.edu", true, { role: "admin", active: true }), /role/i);
});

test("director access roster includes automatic members without duplicating manual approvals", () => {
  const manual = { displayName: "Manual mentor", email: "mentor@example.org", role: "mentor", active: true };
  const automatic = { displayName: "New mentee", email: "student@go.minnstate.edu", role: "mentee", active: true };
  const paused = { displayName: "Paused student", email: "paused@live.bemidjistate.edu", role: "mentee", active: false };
  const roster = access.buildAccessRoster([manual, paused], [manual, automatic]);
  assert.equal(roster.length, 3);
  assert.deepEqual(roster.find((entry) => entry.email === automatic.email), automatic);
  assert.equal(roster.find((entry) => entry.email === paused.email).active, false);
  assert.equal(access.buildAccessRoster([], [automatic]).length, 1);
});

function mockedFirebase(options = {}) {
  const state = {
    events: [], reads: [], writes: [], documents: new Map(), observer: null,
    unsubscribed: false, pendingObservers: [], observerErrors: [], tokenNotifications: 0,
  };
  const user = options.user ?? { uid: "new-student", email: "student@go.minnstate.edu", displayName: "Student", emailVerified: false };
  const auth = { currentUser: options.persistedSession ? user : null };
  const emitToken = (candidate) => {
    if (!state.observer || state.unsubscribed) return;
    // Real SDK callbacks are scheduled but are not awaited by sign-in/reload.
    // A limit makes a recursive observer regression fail rather than hang.
    if (++state.tokenNotifications > 30) throw new Error("Recursive token notifications");
    const callback = state.observer;
    const pending = Promise.resolve()
      .then(() => { if (!state.unsubscribed) return callback(candidate); })
      .catch((error) => { state.observerErrors.push(error); });
    state.pendingObservers.push(pending);
  };
  const flushObservers = async () => {
    while (state.pendingObservers.length) {
      await Promise.all(state.pendingObservers.splice(0));
    }
    if (state.observerErrors.length) throw state.observerErrors[0];
  };
  const authSdk = {
    getAuth: () => auth,
    setPersistence: async () => {},
    browserLocalPersistence: {},
    onIdTokenChanged: (_auth, callback) => {
      state.observer = callback;
      emitToken(auth.currentUser);
      return () => { state.unsubscribed = true; };
    },
    createUserWithEmailAndPassword: async (_auth, email) => {
      state.events.push("create");
      if (options.createError) throw new Error("create failed");
      user.email = email;
      auth.currentUser = user;
      emitToken(user);
      return { user };
    },
    signInWithEmailAndPassword: async () => {
      if (options.signInError) throw new Error("sign-in failed");
      auth.currentUser = user;
      emitToken(user);
      return { user };
    },
    updateProfile: async (candidate, updates) => {
      assert.equal(auth.currentUser, candidate, "Observer must not sign out registration before verification");
      state.events.push("update-name");
      if (options.updateError) throw new Error("name update failed");
      Object.assign(candidate, updates);
    },
    sendEmailVerification: async (candidate) => {
      assert.equal(auth.currentUser, candidate, "Verification still has its authenticated user");
      state.events.push("send-verification");
      await options.beforeSend?.();
      if (options.sendError) throw new Error("verification failed");
    },
    signOut: async () => {
      state.events.push("sign-out");
      auth.currentUser = null;
      emitToken(null);
    },
    reload: async (candidate) => {
      state.events.push("reload");
      if (options.reloadError) throw new Error("reload failed");
      if (options.reloadVerifies) candidate.emailVerified = true;
      // Firebase reload() emits this even when uid/token is unchanged.
      emitToken(candidate);
    },
    sendPasswordResetEmail: async () => {},
  };
  user.getIdToken = async (forceRefresh) => {
    assert.equal(forceRefresh, true);
    state.events.push("refresh-verified-token");
    if (options.refreshError) throw new Error("token refresh failed");
    emitToken(user);
    return "mock-token-not-a-credential";
  };
  const firestoreSdk = {
    getFirestore: () => ({}),
    doc: (_db, collection, id) => `${collection}/${id}`,
    getDoc: async (path) => {
      state.reads.push(path);
      await options.beforeRead?.(path);
      const data = state.documents.get(path);
      return { id: path.split("/").at(-1), exists: () => data !== undefined, data: () => data };
    },
    setDoc: async (path, payload) => { state.writes.push({ path, payload }); state.documents.set(path, payload); },
    serverTimestamp: () => "SERVER_TIMESTAMP",
    writeBatch: () => {
      const changes = [];
      return {
        update: (path, payload) => changes.push({ path, payload }),
        set: (path, payload) => changes.push({ path, payload }),
        commit: async () => { state.events.push("batch-commit"); state.writes.push(...changes); },
      };
    },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(
    readFileSync(new URL("../app/firebase.ts", import.meta.url), "utf8"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  vm.runInNewContext(code, {
    exports: module.exports,
    module,
    require: (name) => {
      if (name === "firebase/app") return { getApps: () => [], initializeApp: () => ({}) };
      if (name === "firebase/auth") return authSdk;
      if (name === "firebase/firestore") return firestoreSdk;
      if (name === "./account-access") return access;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { api: module.exports, auth, state, user, flushObservers, emitToken };
}

test("registration observer cannot interrupt name update or verification and creates no app profile", async () => {
  const { api, auth, state, flushObservers } = mockedFirebase();
  const sessions = [];
  api.watchAuthSession((session) => sessions.push(session), (error) => assert.fail(error));
  await api.registerWithInstitutionalEmail(" Student@GO.MINNSTATE.EDU ", "not-a-real-password", " Student Name ");
  await flushObservers();
  assert.deepEqual(state.events, ["create", "update-name", "send-verification", "sign-out"]);
  assert.equal(auth.currentUser, null);
  assert.equal(state.writes.length, 0);
  assert.ok(sessions.every((session) => session === null));
});

for (const [failure, expectedEvents] of [
  ["updateError", ["create", "update-name", "sign-out"]],
  ["sendError", ["create", "update-name", "send-verification", "sign-out"]],
]) {
  test(`registration signs out temporary session after ${failure}`, async () => {
    const { api, auth, state, flushObservers } = mockedFirebase({ [failure]: true });
    api.watchAuthSession(() => {}, (error) => assert.fail(error));
    await assert.rejects(api.registerWithInstitutionalEmail("student@go.minnstate.edu", "not-a-real-password", "Student"));
    await flushObservers();
    assert.deepEqual(state.events, expectedEvents);
    assert.equal(auth.currentUser, null);
    assert.equal(state.writes.length, 0);
  });
}

test("unverified existing account signs in to resend instead of creating a duplicate", async () => {
  const { api, state, auth, flushObservers } = mockedFirebase();
  api.watchAuthSession(() => {}, (error) => assert.fail(error));
  await assert.rejects(api.signInWithInstitutionalEmail("student@go.minnstate.edu", "not-a-real-password"), /Verification email sent/);
  await flushObservers();
  assert.deepEqual(state.events, ["reload", "send-verification", "sign-out"]);
  assert.equal(auth.currentUser, null);
  assert.equal(state.writes.length, 0);
});

test("verified new institutional profile gets mentee without writing a manual approval", async () => {
  const { api, user, state } = mockedFirebase({ user: { uid: "new-verified", email: "student@live.bemidjistate.edu", displayName: "Student", emailVerified: true } });
  const profile = await api.ensureProfile(user);
  assert.equal(profile.role, "mentee");
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].path, "users/new-verified");
  assert.equal(state.writes[0].payload.role, "mentee");
});

test("cached unverified user activates after sign-in reload confirms verification", async () => {
  const { api, state, user, flushObservers } = mockedFirebase({ reloadVerifies: true });
  const sessions = [];
  api.watchAuthSession((session) => sessions.push(session), (error) => assert.fail(error));
  await api.signInWithInstitutionalEmail(user.email, "not-a-real-password");
  await flushObservers();
  assert.deepEqual(state.events, ["reload", "refresh-verified-token"]);
  assert.equal(sessions.at(-1).profile.role, "mentee");
  assert.equal(state.writes.length, 1);
  assert.ok(!state.events.includes("send-verification"));
});

test("persisted verified sessions and later token notifications never reload recursively", async () => {
  for (const role of ["mentee", "mentor", "director"]) {
    const { api, state, user, emitToken, flushObservers } = mockedFirebase({
      persistedSession: true,
      user: { uid: `existing-${role}`, email: "existing@example.org", displayName: "Existing member", emailVerified: true },
    });
    state.documents.set(`users/${user.uid}`, { email: user.email, displayName: "Existing member", role, active: true });
    const sessions = [];
    api.watchAuthSession((session) => sessions.push(session), (error) => assert.fail(error));
    await flushObservers();
    emitToken(user);
    await flushObservers();
    assert.equal(sessions.length, 2);
    assert.ok(sessions.every((session) => session.profile.role === role));
    assert.equal(state.tokenNotifications, 2);
    assert.deepEqual(state.events, [], "Token observers must not call reload");
    assert.equal(state.writes.length, 0);
  }
});

test("verified sign-in waits for reload notifications and creates exactly one profile", async () => {
  const { api, state, user, flushObservers } = mockedFirebase({
    user: { uid: "verified-signin", email: "student@go.minnstate.edu", displayName: "Student", emailVerified: true },
  });
  const sessions = [];
  api.watchAuthSession((session) => sessions.push(session), (error) => assert.fail(error));
  await api.signInWithInstitutionalEmail(user.email, "not-a-real-password");
  await flushObservers();
  assert.deepEqual(state.events, ["reload"]);
  assert.equal(state.writes.length, 1);
  assert.deepEqual(state.reads, ["users/verified-signin", "approvedUsers/student@go.minnstate.edu"]);
  assert.equal(sessions.filter(Boolean).length, 1);
});

test("persisted unverified session cannot create an app profile", async () => {
  const { api, state, flushObservers } = mockedFirebase({ persistedSession: true });
  const sessions = [];
  api.watchAuthSession((session) => sessions.push(session), (error) => assert.fail(error));
  await flushObservers();
  assert.deepEqual(sessions, [null]);
  assert.equal(state.reads.length, 0);
  assert.equal(state.writes.length, 0);
  assert.deepEqual(state.events, []);
});

test("registration stays authenticated while verification is pending, then cleans up", async () => {
  const sending = deferred();
  const finishSending = deferred();
  const { api, state, auth, flushObservers } = mockedFirebase({ beforeSend: async () => {
    sending.resolve();
    await finishSending.promise;
  } });
  api.watchAuthSession(() => {}, (error) => assert.fail(error));
  const registering = api.registerWithInstitutionalEmail("student@go.minnstate.edu", "not-a-real-password", "Student");
  await sending.promise;
  assert.equal(auth.currentUser?.uid, "new-student");
  assert.equal(state.reads.length, 0);
  assert.ok(!state.events.includes("sign-out"));
  finishSending.resolve();
  await registering;
  await flushObservers();
  assert.equal(auth.currentUser, null);
  assert.equal(state.writes.length, 0);
});

test("failed account creation leaves the observer idle without verification or profile writes", async () => {
  const { api, state, auth, flushObservers } = mockedFirebase({ createError: true });
  api.watchAuthSession(() => {}, (error) => assert.fail(error));
  await assert.rejects(api.registerWithInstitutionalEmail("student@go.minnstate.edu", "not-a-real-password", "Student"), /create failed/);
  await flushObservers();
  assert.deepEqual(state.events, ["create"]);
  assert.equal(auth.currentUser, null);
  assert.equal(state.writes.length, 0);
});

test("failed password sign-in cannot start verification or profile activation", async () => {
  const { api, state, auth, flushObservers } = mockedFirebase({ signInError: true });
  api.watchAuthSession(() => {}, (error) => assert.fail(error));
  await assert.rejects(api.signInWithInstitutionalEmail("student@go.minnstate.edu", "not-a-real-password"), /sign-in failed/);
  await flushObservers();
  assert.deepEqual(state.events, []);
  assert.equal(auth.currentUser, null);
  assert.equal(state.writes.length, 0);
});

for (const [failure, expectedError] of [["reloadError", /reload failed/], ["refreshError", /token refresh failed/]]) {
  test(`failed sign-in ${failure} signs out before token observers activate`, async () => {
    const { api, state, auth, flushObservers } = mockedFirebase({ [failure]: true, reloadVerifies: true });
    api.watchAuthSession(() => {}, (error) => assert.fail(error));
    await assert.rejects(api.signInWithInstitutionalEmail("student@go.minnstate.edu", "not-a-real-password"), expectedError);
    await flushObservers();
    assert.equal(auth.currentUser, null);
    assert.equal(state.events.at(-1), "sign-out");
    assert.equal(state.reads.length, 0);
    assert.equal(state.writes.length, 0);
  });
}

for (const sendError of [false, true]) {
  test(`explicit verification resend always cleans up (${sendError ? "failed send" : "successful send"})`, async () => {
    const { api, state, auth, flushObservers } = mockedFirebase({
      sendError,
      user: { uid: "verified-resend", email: "student@go.minnstate.edu", displayName: "Student", emailVerified: true },
    });
    api.watchAuthSession(() => {}, (error) => assert.fail(error));
    const resending = api.resendVerification("student@go.minnstate.edu", "not-a-real-password");
    if (sendError) await assert.rejects(resending, /verification failed/);
    else await resending;
    await flushObservers();
    assert.deepEqual(state.events, ["send-verification", "sign-out"]);
    assert.equal(auth.currentUser, null);
    assert.equal(state.reads.length, 0);
    assert.equal(state.writes.length, 0);
  });
}

test("sign-out invalidates a profile read that is still in flight", async () => {
  const reading = deferred();
  const finishReading = deferred();
  const { api, state, user, flushObservers } = mockedFirebase({
    persistedSession: true,
    user: { uid: "slow-session", email: "student@go.minnstate.edu", emailVerified: true },
    beforeRead: async () => { reading.resolve(); await finishReading.promise; },
  });
  state.documents.set(`users/${user.uid}`, { email: user.email, displayName: "Student", role: "mentee", active: true });
  const sessions = [];
  api.watchAuthSession((session) => sessions.push(session), (error) => assert.fail(error));
  await reading.promise;
  await api.signOutCurrentUser();
  finishReading.resolve();
  await flushObservers();
  assert.ok(sessions.every((session) => session === null));
  assert.equal(state.writes.length, 0);
});

test("unsubscribing invalidates an observer profile read still in flight", async () => {
  const reading = deferred();
  const finishReading = deferred();
  const { api, state, user, flushObservers } = mockedFirebase({
    persistedSession: true,
    user: { uid: "unsubscribed-session", email: "student@go.minnstate.edu", emailVerified: true },
    beforeRead: async () => { reading.resolve(); await finishReading.promise; },
  });
  state.documents.set(`users/${user.uid}`, { email: user.email, displayName: "Student", role: "mentee", active: true });
  const sessions = [];
  const stop = api.watchAuthSession((session) => sessions.push(session), (error) => assert.fail(error));
  await reading.promise;
  stop();
  finishReading.resolve();
  await flushObservers();
  assert.deepEqual(sessions, []);
  assert.equal(state.writes.length, 0);
});

test("queued sign-ins coalesce their notifications before activating a profile", async () => {
  const { api, state, user, flushObservers } = mockedFirebase({
    user: { uid: "queued-session", email: "student@go.minnstate.edu", displayName: "Student", emailVerified: true },
  });
  const sessions = [];
  api.watchAuthSession((session) => sessions.push(session), (error) => assert.fail(error));
  await Promise.all([
    api.signInWithInstitutionalEmail(user.email, "not-a-real-password"),
    api.signInWithInstitutionalEmail(user.email, "not-a-real-password"),
  ]);
  await flushObservers();
  assert.deepEqual(state.events, ["reload", "reload"]);
  assert.equal(state.writes.length, 1);
  assert.equal(sessions.filter(Boolean).length, 1);
});

test("auth-operation barrier releases queued work even if an operation fails", async () => {
  const barrier = access.createAuthOperationBarrier();
  const finishFirst = deferred();
  const events = [];
  const first = barrier.run(async () => { events.push("first"); await finishFirst.promise; throw new Error("expected failure"); });
  const failed = assert.rejects(first, /expected failure/);
  const second = barrier.run(async () => { events.push("second"); return "done"; });
  const settled = barrier.wait();
  await Promise.resolve();
  assert.deepEqual(events, ["first"]);
  finishFirst.resolve();
  await failed;
  assert.equal(await second, "done");
  assert.equal(barrier.isCurrent(await settled), true);
  assert.deepEqual(events, ["first", "second"]);
});

test("existing roles and progress remain untouched and inactive profiles cannot be replaced", async () => {
  for (const role of ["mentee", "mentor", "director"]) {
    const { api, user, state } = mockedFirebase({ user: { uid: `existing-${role}`, email: "existing@example.org", emailVerified: true } });
    state.documents.set(`users/${user.uid}`, { email: user.email, displayName: "Existing member", role, active: true });
    const profile = await api.ensureProfile(user);
    assert.equal(profile.role, role);
    assert.equal(state.writes.length, 0);
    assert.equal(state.reads.length, 1, "Existing activated account does not need another approval");
  }
  const { api, user, state } = mockedFirebase({ user: { uid: "paused", email: "paused@go.minnstate.edu", emailVerified: true } });
  state.documents.set("users/paused", { email: user.email, displayName: "Paused", role: "mentee", active: false });
  await assert.rejects(api.ensureProfile(user), /inactive/);
  assert.equal(state.writes.length, 0);
});

test("paused explicit approvals block domain fallback and external approvals retain their assigned role", async () => {
  const { api, user, state } = mockedFirebase({ user: { uid: "not-activated", email: "paused@go.minnstate.edu", emailVerified: true } });
  state.documents.set(`approvedUsers/${user.email}`, { active: false, role: "mentee" });
  await assert.rejects(api.ensureProfile(user), /paused/);
  assert.equal(state.writes.length, 0);
  user.email = "approved@another-college.edu";
  state.documents.set(`approvedUsers/${user.email}`, { active: true, role: "mentor", displayName: "Approved Mentor" });
  assert.equal((await api.ensureProfile(user)).role, "mentor");
});

test("pausing an auto-admitted account atomically saves the user and durable email override", async () => {
  const { api, state } = mockedFirebase();
  await api.updateActivatedUser({ uid: "student", email: "student@go.minnstate.edu", displayName: "Student", role: "mentee", active: true }, { role: "mentee", active: false });
  assert.deepEqual(state.events, ["batch-commit"]);
  assert.deepEqual(state.writes.map((entry) => entry.path), ["users/student", "approvedUsers/student@go.minnstate.edu"]);
  assert.ok(state.writes.every((entry) => entry.payload.active === false));
});
