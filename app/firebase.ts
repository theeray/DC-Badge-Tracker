import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
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

const firebaseConfig = {
  apiKey: "AIzaSyA-vv7a-1baW1kyGyMZPl_DT2j9HV1ycoU",
  authDomain: "digital-corps-badge-tracker.firebaseapp.com",
  projectId: "digital-corps-badge-tracker",
  storageBucket: "digital-corps-badge-tracker.firebasestorage.app",
  messagingSenderId: "234917766792",
  appId: "1:234917766792:web:04dfab9d335c9d6647a13d",
  measurementId: "G-WH0165EZ0Y",
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

if (typeof window !== "undefined") {
  void setPersistence(auth, browserLocalPersistence);
}

export type AppRole = "mentee" | "mentor" | "director";

export type UserProfile = {
  uid: string;
  displayName: string;
  email: string;
  role: AppRole;
  active: boolean;
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

export type AuthSession = {
  user: User;
  profile: UserProfile;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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

export async function registerWithInstitutionalEmail(
  email: string,
  password: string,
  displayName: string,
) {
  const credential = await createUserWithEmailAndPassword(
    auth,
    normalizeEmail(email),
    password,
  );
  await updateProfile(credential.user, { displayName: displayName.trim() });
  await sendEmailVerification(credential.user);
  await signOut(auth);
}

export async function signInWithInstitutionalEmail(
  email: string,
  password: string,
) {
  const credential = await signInWithEmailAndPassword(
    auth,
    normalizeEmail(email),
    password,
  );
  await reload(credential.user);
  if (!credential.user.emailVerified) {
    let message =
      "Verification email sent. Open it in your institutional inbox, verify the address, then sign in again.";
    try {
      await sendEmailVerification(credential.user);
    } catch {
      message =
        "Please verify your institutional email before signing in. If the verification message is not in your inbox, wait a moment and try signing in again to resend it.";
    } finally {
      await signOut(auth);
    }
    throw new Error(message);
  }
  return credential.user;
}

export async function resendVerification(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(
    auth,
    normalizeEmail(email),
    password,
  );
  await sendEmailVerification(credential.user);
  await signOut(auth);
}

export async function requestPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, normalizeEmail(email));
}

export async function signOutCurrentUser() {
  await signOut(auth);
}

export async function ensureProfile(user: User): Promise<UserProfile> {
  const email = normalizeEmail(user.email ?? "");
  if (!email || !user.emailVerified) {
    throw new Error("A verified institutional email is required.");
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
  if (!approval.exists() || approval.data().active !== true) {
    throw new Error(
      "This email is not on the approved Digital Corps roster. Contact a faculty director.",
    );
  }

  const approvalData = approval.data();
  const profile = {
    displayName:
      user.displayName?.trim() ||
      String(approvalData.displayName ?? email.split("@")[0]),
    email,
    role: approvalData.role as AppRole,
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
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      onSession(null);
      return;
    }

    try {
      await reload(user);
      const profile = await ensureProfile(user);
      onSession({ user, profile });
    } catch (error) {
      onError(readableFirebaseError(error));
      await signOut(auth);
      onSession(null);
    }
  });
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
  await updateDoc(doc(db, "users", profile.uid), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, "approvedUsers", profile.email),
    {
      email: profile.email,
      displayName: profile.displayName,
      ...updates,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
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
      "An account already exists for that email. Use Sign in or Reset password.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Enter a valid institutional email address.",
    "auth/too-many-requests":
      "Firebase temporarily paused sign-in attempts. Please wait a few minutes.",
    "auth/weak-password": "Use a password with at least six characters.",
    "permission-denied":
      "This account does not have permission for that action.",
  };
  return messages[code] ?? "Firebase could not complete that request. Please try again.";
}
