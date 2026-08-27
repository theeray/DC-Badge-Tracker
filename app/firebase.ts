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
  updateDoc,
  where,
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
    await signOut(auth);
    throw new Error(
      "Please verify your institutional email before signing in. Check your inbox for Firebase's verification message.",
    );
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

export async function clearMenteeProgress(menteeId: string) {
  await deleteDoc(doc(db, "progress", menteeId));
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
