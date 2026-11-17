import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onIdTokenChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import type { SkillStatus } from "./data";
import { emulatorAutoSignInRole, emulatorBrowserConnection, useFirebaseEmulators } from "./firebase-environment";
import {
  completeEmailRegistration,
  createAuthOperationBarrier,
  normalizeAccountEmail,
  resolveNewAccountRole,
} from "./account-access";

const firebaseConfig = {
  apiKey: "AIzaSyA-vv7a-1baW1kyGyMZPl_DT2j9HV1ycoU",
  authDomain: "digital-corps-badge-tracker.firebaseapp.com",
  projectId: "digital-corps-badge-tracker",
  storageBucket: "digital-corps-badge-tracker.firebasestorage.app",
  messagingSenderId: "234917766792",
  appId: "1:234917766792:web:04dfab9d335c9d6647a13d",
  measurementId: "G-WH0165EZ0Y",
};

const firebaseApp = getApps().length ? getApp() : initializeApp(useFirebaseEmulators ? {
  ...firebaseConfig,
  apiKey: "demo-dc-central-content-api-key",
  authDomain: "demo-dc-central-content.firebaseapp.com",
  projectId: "demo-dc-central-content",
  storageBucket: "demo-dc-central-content.appspot.com",
  appId: "demo-dc-central-content-web",
} : firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
const authOperations = createAuthOperationBarrier();

if (useFirebaseEmulators) {
  if (firebaseApp.options.projectId !== "demo-dc-central-content") {
    throw new Error("Local emulator mode requires the isolated demo project.");
  }
  const connection = emulatorBrowserConnection();
  if (!connection) throw new Error("The isolated demo emulators require a browser preview.");
  // The local Vite proxy keeps SDK requests on the preview's existing origin;
  // the backend targets are fixed loopback services in firebase.vite.config.ts.
  connectAuthEmulator(auth, connection.authUrl);
  connectFirestoreEmulator(db, connection.host, connection.port);
}

if (typeof window !== "undefined") {
  const persistenceReady = setPersistence(auth, browserLocalPersistence);
  if (useFirebaseEmulators && emulatorAutoSignInRole) {
    // Explicit local QA only. These reserved .invalid identities are fixtures,
    // not campus accounts, and cannot sign in to the production Firebase app.
    const email = `${emulatorAutoSignInRole}@dc-central.invalid`;
    void persistenceReady.then(() => signInWithInstitutionalEmail(email, "Local-content-demo-only-2026!"))
      .catch(() => console.error("The isolated local demo account could not sign in. Run the emulator fixture seed script."));
  } else {
    void persistenceReady;
  }
}

export type AppRole = "mentee" | "mentor" | "director";

export type UserProfile = {
  uid: string;
  displayName: string;
  email: string;
  role: AppRole;
  active: boolean;
};

export type SummerInterest = "yes" | "no" | "maybe" | "unsure";

export type MemberProfile = {
  memberId: string;
  displayName: string;
  email: string;
  phone: string;
  major: string;
  graduationYear: string;
  school: string;
  hasUniform: boolean;
  shirtSize: string;
  preferredWeeklyHours: string;
  officeHours: string;
  workInterests: string[];
  specialties: string[];
  socialMediaAreas: string[];
  excitement: string;
  campaignIdeas: string;
  summerInterest: SummerInterest;
  websiteBlurb: string;
  professionalLink: string;
  favoriteProject: string;
  funFacts: string;
};

export type ApprovedUser = {
  email: string;
  displayName: string;
  role: AppRole;
  active: boolean;
};

export type Endorsement = {
  id: string;
  menteeId: string;
  skillId: string;
  mentorId: string;
  mentorName: string;
};

export type DemonstrationRequest = {
  id: string;
  memberId: string;
  memberName: string;
  skillId: string;
  mentorId: string;
  mentorName: string;
};

export type ProgressRecord = {
  ownerId: string;
  statuses: Record<string, SkillStatus>;
};

export type TimeEntry = {
  id: string;
  workerId: string;
  workerName: string;
  startedAt: Date;
  endedAt: Date | null;
  note: string;
};

export type TimeEntryDraft = Omit<TimeEntry, "id">;

export type CredentialLevel = "Silver" | "Gold";

export type SkillCredential = {
  id: string;
  workerId: string;
  workerName: string;
  skillId: string;
  level: CredentialLevel;
  note: string;
  awardedBy: string;
  awardedByName: string;
};

export type AssignmentStatus =
  | "assigned"
  | "in-progress"
  | "ready"
  | "complete";

export type SkillAssignment = {
  id: string;
  assigneeId: string;
  assigneeName: string;
  skillId: string;
  note: string;
  status: AssignmentStatus;
  assignedBy: string;
  assignedByName: string;
  assignedByRole: "mentor" | "director";
};

export type SelfReportedSkill = {
  id: string;
  memberId: string;
  memberName: string;
  skillId: string;
  level: CredentialLevel;
  evidence: string;
};

export type AuthSession = {
  user: User;
  profile: UserProfile;
};

function normalizeEmail(email: string) {
  return normalizeAccountEmail(email);
}

function profileFromDocument(uid: string, data: DocumentData): UserProfile {
  return {
    uid,
    displayName: String(data.displayName ?? data.email ?? "Digital Corps member"),
    email: String(data.email ?? ""),
    role: data.role as AppRole,
    active: data.active === true,
  };
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function memberProfileFromDocument(
  memberId: string,
  data: DocumentData,
): MemberProfile {
  return {
    memberId,
    displayName: String(data.displayName ?? "Digital Corps member"),
    email: String(data.email ?? ""),
    phone: String(data.phone ?? ""),
    major: String(data.major ?? ""),
    graduationYear: String(data.graduationYear ?? ""),
    school: String(data.school ?? ""),
    hasUniform: data.hasUniform === true,
    shirtSize: String(data.shirtSize ?? ""),
    preferredWeeklyHours: String(data.preferredWeeklyHours ?? ""),
    officeHours: String(data.officeHours ?? ""),
    workInterests: stringList(data.workInterests),
    specialties: stringList(data.specialties),
    socialMediaAreas: stringList(data.socialMediaAreas),
    excitement: String(data.excitement ?? ""),
    campaignIdeas: String(data.campaignIdeas ?? ""),
    summerInterest:
      data.summerInterest === "yes" ||
      data.summerInterest === "no" ||
      data.summerInterest === "maybe"
        ? data.summerInterest
        : "unsure",
    websiteBlurb: String(data.websiteBlurb ?? ""),
    professionalLink: String(data.professionalLink ?? ""),
    favoriteProject: String(data.favoriteProject ?? ""),
    funFacts: String(data.funFacts ?? ""),
  };
}

export async function registerWithInstitutionalEmail(
  email: string,
  password: string,
  displayName: string,
) {
  const name = displayName.trim();
  if (!name || name.length > 160) {
    throw new Error("Enter your name using 1–160 characters.");
  }
  await authOperations.run(() => completeEmailRegistration<User>({
    createUser: async () => (await createUserWithEmailAndPassword(
      auth,
      normalizeEmail(email),
      password,
    )).user,
    updateName: (user) => updateProfile(user, { displayName: name }),
    sendVerification: (user) => sendEmailVerification(user),
    signOut: async (user) => {
      if (auth.currentUser?.uid === user.uid) await signOut(auth);
    },
  }));
}

export async function signInWithInstitutionalEmail(
  email: string,
  password: string,
) {
  return authOperations.run(async () => {
    const credential = await signInWithEmailAndPassword(
      auth,
      normalizeEmail(email),
      password,
    );
    try {
      const wasVerified = credential.user.emailVerified;
      await reload(credential.user);
      if (!credential.user.emailVerified) {
        let message =
          "Verification email sent. Open it in your institutional inbox, verify the address, then sign in again.";
        try {
          await sendEmailVerification(credential.user);
        } catch {
          message =
            "Please verify your approved email before signing in. If the verification message is not in your inbox, wait a moment and try signing in again to resend it.";
        }
        throw new Error(message);
      }
      // A cached unverified user may become verified during reload. Refresh
      // the token before observers/Firestore use its email_verified claim.
      if (!wasVerified) await credential.user.getIdToken(true);
      return credential.user;
    } catch (error) {
      if (auth.currentUser?.uid === credential.user.uid) await signOut(auth);
      throw error;
    }
  });
}

export async function resendVerification(email: string, password: string) {
  await authOperations.run(async () => {
    const credential = await signInWithEmailAndPassword(
      auth,
      normalizeEmail(email),
      password,
    );
    try {
      await sendEmailVerification(credential.user);
    } finally {
      if (auth.currentUser?.uid === credential.user.uid) await signOut(auth);
    }
  });
}

export async function requestPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, normalizeEmail(email));
}

export async function signOutCurrentUser() {
  await authOperations.run(() => signOut(auth));
}

export async function ensureProfile(user: User): Promise<UserProfile> {
  const email = normalizeEmail(user.email ?? "");
  if (!email || !user.emailVerified) {
    throw new Error("Verify your email address before entering DC Central.");
  }

  const profileReference = doc(db, "users", user.uid);
  const existing = await getDoc(profileReference);
  if (existing.exists()) {
    const profile = profileFromDocument(existing.id, existing.data());
    if (!profile.active) {
      throw new Error("This Digital Corps account is currently inactive.");
    }
    return profile;
  }

  const approvalReference = doc(db, "approvedUsers", email);
  const approval = await getDoc(approvalReference);
  const approvalData = approval.exists() ? approval.data() : null;
  const role = resolveNewAccountRole(email, user.emailVerified, approvalData ? {
    active: approvalData.active === true,
    role: approvalData.role as AppRole,
  } : null);
  const displayName = user.displayName?.trim()
    || String(approvalData?.displayName ?? email.split("@")[0]).trim();
  if (!displayName || displayName.length > 160) {
    throw new Error("Your account name must use 1–160 characters. Contact a faculty director for help.");
  }
  const profile = {
    displayName,
    email,
    role,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(profileReference, profile);
  return profileFromDocument(user.uid, profile);
}

export function watchAuthSession(
  onSession: (session: AuthSession | null) => void,
  onError: (message: string) => void,
): Unsubscribe {
  let observation = 0;
  let stopped = false;
  const unsubscribe = onIdTokenChanged(auth, async (user) => {
    const currentObservation = ++observation;
    let operationVersion: number;
    const isCurrent = () => !stopped
      && currentObservation === observation
      && auth.currentUser?.uid === user?.uid
      && authOperations.isCurrent(operationVersion);
    // Creating an account signs it in before updateProfile/verification finish.
    // Do not run ensureProfile or sign it out while that sequence is in flight.
    if (!user) {
      onSession(null);
      return;
    }

    try {
      operationVersion = await authOperations.wait();
      if (!isCurrent()) return;
      if (!user.emailVerified) {
        onSession(null);
        return;
      }
      const profile = await ensureProfile(user);
      if (!isCurrent()) return;
      onSession({ user, profile });
    } catch (error) {
      if (!isCurrent()) return;
      onError(readableFirebaseError(error));
      await signOut(auth);
      onSession(null);
    }
  });
  return () => {
    stopped = true;
    observation += 1;
    unsubscribe();
  };
}

export function watchProgress(
  menteeId: string,
  onChange: (statuses: Record<string, SkillStatus>) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    doc(db, "progress", menteeId),
    (snapshot) => {
      onChange(
        snapshot.exists()
          ? (snapshot.data().statuses as Record<string, SkillStatus>)
          : {},
      );
    },
    (error) => onError(readableFirebaseError(error)),
  );
}

export async function saveProgress(
  menteeId: string,
  statuses: Record<string, SkillStatus>,
) {
  await setDoc(
    doc(db, "progress", menteeId),
    {
      ownerId: menteeId,
      statuses,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function watchEndorsements(
  menteeId: string,
  onChange: (endorsements: Endorsement[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    query(
      collection(db, "endorsements"),
      where("menteeId", "==", menteeId),
    ),
    (snapshot) =>
      onChange(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Endorsement, "id">),
        })),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export function watchAllProgress(
  onChange: (records: Record<string, ProgressRecord>) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    collection(db, "progress"),
    (snapshot) => {
      const records: Record<string, ProgressRecord> = {};
      for (const item of snapshot.docs) {
        records[item.id] = {
          ownerId: String(item.data().ownerId ?? item.id),
          statuses: (item.data().statuses ?? {}) as Record<string, SkillStatus>,
        };
      }
      onChange(records);
    },
    (error) => onError(readableFirebaseError(error)),
  );
}

export function watchAllEndorsements(
  onChange: (endorsements: Endorsement[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    collection(db, "endorsements"),
    (snapshot) =>
      onChange(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Endorsement, "id">),
        })),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export async function addEndorsement(
  menteeId: string,
  skillId: string,
  mentor: UserProfile,
) {
  const id = `${menteeId}_${skillId}_${mentor.uid}`;
  await setDoc(doc(db, "endorsements", id), {
    menteeId,
    skillId,
    mentorId: mentor.uid,
    mentorName: mentor.displayName,
    createdAt: serverTimestamp(),
  });
  return id;
}

export async function removeEndorsement(id: string) {
  await deleteDoc(doc(db, "endorsements", id));
}

export function watchMentees(
  onChange: (mentees: UserProfile[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    query(
      collection(db, "users"),
      where("role", "==", "mentee"),
      where("active", "==", true),
    ),
    (snapshot) =>
      onChange(
        snapshot.docs
          .map((item) => profileFromDocument(item.id, item.data()))
          .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export function watchStudentWorkers(
  reviewerId: string,
  onChange: (members: UserProfile[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    query(collection(db, "users"), where("active", "==", true)),
    (snapshot) =>
      onChange(
        snapshot.docs
          .map((item) => profileFromDocument(item.id, item.data()))
          .filter(
            (item) =>
              item.uid !== reviewerId &&
              (item.role === "mentee" || item.role === "mentor"),
          )
          .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export function watchMentors(
  onChange: (mentors: UserProfile[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    query(
      collection(db, "users"),
      where("role", "==", "mentor"),
      where("active", "==", true),
    ),
    (snapshot) =>
      onChange(
        snapshot.docs
          .map((item) => profileFromDocument(item.id, item.data()))
          .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export function watchApprovedUsers(
  onChange: (users: ApprovedUser[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    collection(db, "approvedUsers"),
    (snapshot) =>
      onChange(
        snapshot.docs
          .map((item) => ({
            email: item.id,
            displayName: String(item.data().displayName ?? item.id),
            role: item.data().role as AppRole,
            active: item.data().active === true,
          }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export function watchAllUsers(
  onChange: (users: UserProfile[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    collection(db, "users"),
    (snapshot) =>
      onChange(
        snapshot.docs
          .map((item) => profileFromDocument(item.id, item.data()))
          .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export function watchMemberProfile(
  memberId: string,
  onChange: (profile: MemberProfile | null) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    doc(db, "memberProfiles", memberId),
    (snapshot) =>
      onChange(
        snapshot.exists()
          ? memberProfileFromDocument(snapshot.id, snapshot.data())
          : null,
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export function watchAllMemberProfiles(
  onChange: (profiles: MemberProfile[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    collection(db, "memberProfiles"),
    (snapshot) =>
      onChange(
        snapshot.docs
          .map((item) => memberProfileFromDocument(item.id, item.data()))
          .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export async function saveMemberProfile(
  member: UserProfile,
  profile: Omit<MemberProfile, "memberId" | "displayName" | "email">,
) {
  const reference = doc(db, "memberProfiles", member.uid);
  const existing = await getDoc(reference);
  const payload = {
    memberId: member.uid,
    displayName: member.displayName,
    email: member.email,
    ...profile,
    updatedAt: serverTimestamp(),
    ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
  };
  await setDoc(reference, payload, { merge: true });
}

export async function saveApprovedUser(user: ApprovedUser) {
  const email = normalizeEmail(user.email);
  await setDoc(
    doc(db, "approvedUsers", email),
    {
      email,
      displayName: user.displayName.trim(),
      role: user.role,
      active: user.active,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function updateActivatedUser(
  profile: UserProfile,
  updates: Pick<UserProfile, "role" | "active">,
) {
  const batch = writeBatch(db);
  batch.update(doc(db, "users", profile.uid), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
  batch.set(
    doc(db, "approvedUsers", normalizeEmail(profile.email)),
    {
      email: normalizeEmail(profile.email),
      displayName: profile.displayName,
      ...updates,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();
}

export function watchProgressBackups(
  onChange: (menteeIds: Set<string>) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    collection(db, "progressBackups"),
    (snapshot) => onChange(new Set(snapshot.docs.map((item) => item.id))),
    (error) => onError(readableFirebaseError(error)),
  );
}

export async function resetMenteeProgress(menteeId: string) {
  const progressReference = doc(db, "progress", menteeId);
  const backupReference = doc(db, "progressBackups", menteeId);
  const snapshot = await getDoc(progressReference);
  const batch = writeBatch(db);
  batch.set(backupReference, {
    ownerId: menteeId,
    statuses: snapshot.exists() ? (snapshot.data().statuses ?? {}) : {},
    backedUpAt: serverTimestamp(),
  });
  batch.delete(progressReference);
  await batch.commit();
}

export async function restoreMenteeProgress(menteeId: string) {
  const progressReference = doc(db, "progress", menteeId);
  const backupReference = doc(db, "progressBackups", menteeId);
  const snapshot = await getDoc(backupReference);
  if (!snapshot.exists()) {
    throw new Error("No saved progress backup is available for this member.");
  }
  const batch = writeBatch(db);
  batch.set(progressReference, {
    ownerId: menteeId,
    statuses: snapshot.data().statuses ?? {},
    updatedAt: serverTimestamp(),
  });
  batch.delete(backupReference);
  await batch.commit();
}

function timestampToDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : new Date(0);
}

function timeEntryFromDocument(id: string, data: DocumentData): TimeEntry {
  return {
    id,
    workerId: String(data.workerId ?? ""),
    workerName: String(data.workerName ?? "Digital Corps worker"),
    startedAt: timestampToDate(data.startedAt),
    endedAt: data.endedAt instanceof Timestamp ? data.endedAt.toDate() : null,
    note: String(data.note ?? ""),
  };
}

export function watchTimeEntries(
  profile: UserProfile,
  onChange: (entries: TimeEntry[]) => void,
  onError: (message: string) => void,
) {
  const source =
    profile.role === "director"
      ? collection(db, "timeEntries")
      : query(
          collection(db, "timeEntries"),
          where("workerId", "==", profile.uid),
        );
  return onSnapshot(
    source,
    (snapshot) =>
      onChange(
        snapshot.docs
          .map((item) => timeEntryFromDocument(item.id, item.data()))
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export async function createTimeEntry(entry: TimeEntryDraft) {
  const reference = doc(collection(db, "timeEntries"));
  await setDoc(reference, {
    workerId: entry.workerId,
    workerName: entry.workerName,
    startedAt: Timestamp.fromDate(entry.startedAt),
    endedAt: entry.endedAt ? Timestamp.fromDate(entry.endedAt) : null,
    note: entry.note.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return reference.id;
}

export async function updateTimeEntry(
  id: string,
  updates: Pick<TimeEntry, "startedAt" | "endedAt" | "note">,
) {
  await updateDoc(doc(db, "timeEntries", id), {
    startedAt: Timestamp.fromDate(updates.startedAt),
    endedAt: updates.endedAt ? Timestamp.fromDate(updates.endedAt) : null,
    note: updates.note.trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTimeEntry(id: string) {
  await deleteDoc(doc(db, "timeEntries", id));
}

function credentialFromDocument(
  id: string,
  data: DocumentData,
): SkillCredential {
  return {
    id,
    workerId: String(data.workerId ?? ""),
    workerName: String(data.workerName ?? "Digital Corps worker"),
    skillId: String(data.skillId ?? ""),
    level: data.level as CredentialLevel,
    note: String(data.note ?? ""),
    awardedBy: String(data.awardedBy ?? ""),
    awardedByName: String(data.awardedByName ?? "Faculty director"),
  };
}

export function watchSkillCredentials(
  onChange: (credentials: SkillCredential[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    collection(db, "skillCredentials"),
    (snapshot) =>
      onChange(
        snapshot.docs.map((item) =>
          credentialFromDocument(item.id, item.data()),
        ),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export function watchMemberSkillCredentials(
  workerId: string,
  onChange: (credentials: SkillCredential[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    query(
      collection(db, "skillCredentials"),
      where("workerId", "==", workerId),
    ),
    (snapshot) =>
      onChange(
        snapshot.docs.map((item) =>
          credentialFromDocument(item.id, item.data()),
        ),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export async function saveSkillCredential(
  worker: UserProfile,
  skillId: string,
  level: CredentialLevel,
  note: string,
  director: UserProfile,
) {
  const id = `${worker.uid}_${skillId}`;
  await setDoc(doc(db, "skillCredentials", id), {
    workerId: worker.uid,
    workerName: worker.displayName,
    skillId,
    level,
    note: note.trim(),
    awardedBy: director.uid,
    awardedByName: director.displayName,
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function removeSkillCredential(id: string) {
  await deleteDoc(doc(db, "skillCredentials", id));
}

function assignmentFromDocument(
  id: string,
  data: DocumentData,
): SkillAssignment {
  return {
    id,
    assigneeId: String(data.assigneeId ?? ""),
    assigneeName: String(data.assigneeName ?? "Digital Corps member"),
    skillId: String(data.skillId ?? ""),
    note: String(data.note ?? ""),
    status: data.status as AssignmentStatus,
    assignedBy: String(data.assignedBy ?? ""),
    assignedByName: String(data.assignedByName ?? "Digital Corps staff"),
    assignedByRole: data.assignedByRole as "mentor" | "director",
  };
}

export function watchSkillAssignments(
  profile: UserProfile,
  onChange: (assignments: SkillAssignment[]) => void,
  onError: (message: string) => void,
) {
  const source =
    profile.role === "mentor" || profile.role === "director"
      ? collection(db, "skillAssignments")
      : query(
          collection(db, "skillAssignments"),
          where("assigneeId", "==", profile.uid),
        );
  return onSnapshot(
    source,
    (snapshot) =>
      onChange(
        snapshot.docs
          .map((item) => assignmentFromDocument(item.id, item.data()))
          .sort(
            (a, b) =>
              a.assigneeName.localeCompare(b.assigneeName) ||
              a.skillId.localeCompare(b.skillId),
          ),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export async function saveSkillAssignment(
  assignee: UserProfile,
  skillId: string,
  note: string,
  assigner: UserProfile,
) {
  if (assigner.role !== "mentor" && assigner.role !== "director") {
    throw new Error("Only mentors and faculty directors can assign learning.");
  }
  const id = `${assignee.uid}_${skillId}`;
  const reference = doc(db, "skillAssignments", id);
  const existing = await getDoc(reference);
  if (existing.exists()) {
    await updateDoc(reference, {
      note: note.trim(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(reference, {
      assigneeId: assignee.uid,
      assigneeName: assignee.displayName,
      skillId,
      note: note.trim(),
      status: "assigned",
      assignedBy: assigner.uid,
      assignedByName: assigner.displayName,
      assignedByRole: assigner.role,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  return id;
}

export async function updateSkillAssignmentNote(id: string, note: string) {
  await updateDoc(doc(db, "skillAssignments", id), {
    note: note.trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateSkillAssignmentStatus(
  id: string,
  status: AssignmentStatus,
) {
  await updateDoc(doc(db, "skillAssignments", id), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function removeSkillAssignment(id: string) {
  await deleteDoc(doc(db, "skillAssignments", id));
}

export async function restoreSkillAssignment(assignment: SkillAssignment) {
  await setDoc(doc(db, "skillAssignments", assignment.id), {
    assigneeId: assignment.assigneeId,
    assigneeName: assignment.assigneeName,
    skillId: assignment.skillId,
    note: assignment.note,
    status: assignment.status,
    assignedBy: assignment.assignedBy,
    assignedByName: assignment.assignedByName,
    assignedByRole: assignment.assignedByRole,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

function selfReportedSkillFromDocument(
  id: string,
  data: DocumentData,
): SelfReportedSkill {
  return {
    id,
    memberId: String(data.memberId ?? ""),
    memberName: String(data.memberName ?? "Digital Corps member"),
    skillId: String(data.skillId ?? ""),
    level: data.level as CredentialLevel,
    evidence: String(data.evidence ?? ""),
  };
}

export function watchSelfReportedSkills(
  profile: UserProfile,
  onChange: (reports: SelfReportedSkill[]) => void,
  onError: (message: string) => void,
) {
  const source =
    profile.role === "mentor" || profile.role === "director"
      ? collection(db, "selfReportedSkills")
      : query(
          collection(db, "selfReportedSkills"),
          where("memberId", "==", profile.uid),
        );
  return onSnapshot(
    source,
    (snapshot) =>
      onChange(
        snapshot.docs.map((item) =>
          selfReportedSkillFromDocument(item.id, item.data()),
        ),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export function watchMemberSelfReportedSkills(
  memberId: string,
  onChange: (reports: SelfReportedSkill[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    query(
      collection(db, "selfReportedSkills"),
      where("memberId", "==", memberId),
    ),
    (snapshot) =>
      onChange(
        snapshot.docs.map((item) =>
          selfReportedSkillFromDocument(item.id, item.data()),
        ),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export async function saveSelfReportedSkill(
  member: UserProfile,
  skillId: string,
  level: CredentialLevel,
  evidence: string,
) {
  const id = `${member.uid}_${skillId}`;
  const reference = doc(db, "selfReportedSkills", id);
  const existing = await getDoc(reference);
  if (existing.exists()) {
    await updateDoc(reference, {
      level,
      evidence: evidence.trim(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(reference, {
      memberId: member.uid,
      memberName: member.displayName,
      skillId,
      level,
      evidence: evidence.trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  return id;
}

function demonstrationRequestFromDocument(
  id: string,
  data: DocumentData,
): DemonstrationRequest {
  return {
    id,
    memberId: String(data.memberId ?? ""),
    memberName: String(data.memberName ?? "Digital Corps member"),
    skillId: String(data.skillId ?? ""),
    mentorId: String(data.mentorId ?? ""),
    mentorName: String(data.mentorName ?? "Student mentor"),
  };
}

export function watchDemonstrationRequests(
  memberId: string,
  viewer: UserProfile,
  onChange: (requests: DemonstrationRequest[]) => void,
  onError: (message: string) => void,
) {
  const source =
    viewer.role === "mentor" && viewer.uid !== memberId
      ? query(
          collection(db, "demonstrationRequests"),
          where("memberId", "==", memberId),
          where("mentorId", "==", viewer.uid),
        )
      : query(
          collection(db, "demonstrationRequests"),
          where("memberId", "==", memberId),
        );
  return onSnapshot(
    source,
    (snapshot) =>
      onChange(
        snapshot.docs.map((item) =>
          demonstrationRequestFromDocument(item.id, item.data()),
        ),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export function watchMentorDemonstrationRequests(
  mentorId: string,
  onChange: (requests: DemonstrationRequest[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    query(
      collection(db, "demonstrationRequests"),
      where("mentorId", "==", mentorId),
    ),
    (snapshot) =>
      onChange(
        snapshot.docs.map((item) =>
          demonstrationRequestFromDocument(item.id, item.data()),
        ),
      ),
    (error) => onError(readableFirebaseError(error)),
  );
}

export async function requestSkillDemonstration(
  member: UserProfile,
  skillId: string,
  mentor: UserProfile,
) {
  if (mentor.role !== "mentor" || member.uid === mentor.uid) {
    throw new Error("A mentor can request a demonstration from another student member.");
  }
  const id = `${member.uid}_${skillId}_${mentor.uid}`;
  await setDoc(doc(db, "demonstrationRequests", id), {
    memberId: member.uid,
    memberName: member.displayName,
    skillId,
    mentorId: mentor.uid,
    mentorName: mentor.displayName,
    createdAt: serverTimestamp(),
  });
  return id;
}

export async function removeDemonstrationRequest(id: string) {
  await deleteDoc(doc(db, "demonstrationRequests", id));
}

export async function restoreDemonstrationRequest(
  request: DemonstrationRequest,
) {
  await setDoc(doc(db, "demonstrationRequests", request.id), {
    memberId: request.memberId,
    memberName: request.memberName,
    skillId: request.skillId,
    mentorId: request.mentorId,
    mentorName: request.mentorName,
    createdAt: serverTimestamp(),
  });
}

export async function removeSelfReportedSkill(id: string) {
  await deleteDoc(doc(db, "selfReportedSkills", id));
}

export async function restoreSelfReportedSkill(report: SelfReportedSkill) {
  await setDoc(doc(db, "selfReportedSkills", report.id), {
    memberId: report.memberId,
    memberName: report.memberName,
    skillId: report.skillId,
    level: report.level,
    evidence: report.evidence,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function readableFirebaseError(error: unknown) {
  if (error instanceof Error && !error.message.startsWith("Firebase:")) {
    return error.message;
  }
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  const messages: Record<string, string> = {
    "auth/email-already-in-use":
      "An account already exists for that email. Use Sign in with your existing password to resend verification, or choose Reset password.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests":
      "Firebase temporarily paused sign-in attempts. Please wait a few minutes.",
    "auth/weak-password": "Use a password with at least six characters.",
    "permission-denied":
      "This account does not have permission for that action.",
  };
  return messages[code] ?? "Firebase could not complete that request. Please try again.";
}
