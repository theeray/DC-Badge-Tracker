import { useCallback, useEffect, useState } from "react";
import type { FirebaseError } from "firebase/app";
import type { User } from "firebase/auth";
import { isAccountRole, type AccountProfile } from "./accounts";
import { firebaseConfigured, getFirebaseServices, type FirebaseServices } from "./firebase";

type AccountNotice = {
  kind: "error" | "success";
  message: string;
};

export type AccountSessionController = {
  configured: boolean;
  loading: boolean;
  busy: boolean;
  email: string | null;
  profile: AccountProfile | null;
  notice: AccountNotice | null;
  signIn: (email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearNotice: () => void;
};

function authErrorMessage(error: unknown) {
  const code = (error as FirebaseError | undefined)?.code;

  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a few minutes and try again.";
  if (code === "auth/network-request-failed") return "The sign-in service could not be reached. Check your connection and try again.";
  if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
    return "The email or password was not recognized.";
  }

  return "Account access is unavailable right now. Try again or contact a Faculty Director.";
}

async function loadProfile(user: User, services: FirebaseServices): Promise<AccountProfile> {
  const snapshot = await services.firestoreApi.getDoc(
    services.firestoreApi.doc(services.database, "profiles", user.uid),
  );
  if (!snapshot.exists()) throw new Error("not-invited");
  const data = snapshot.data();

  if (
    typeof data.displayName !== "string" ||
    typeof data.title !== "string" ||
    !isAccountRole(data.role) ||
    data.active !== true
  ) {
    throw new Error("not-invited");
  }

  return {
    id: user.uid,
    displayName: data.displayName,
    role: data.role,
    title: data.title,
    active: true,
  };
}

export function useAccountSession(): AccountSessionController {
  const [loading, setLoading] = useState(firebaseConfigured);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [notice, setNotice] = useState<AccountNotice | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;

    let mounted = true;
    let unsubscribe: () => void = () => {};

    void getFirebaseServices().then((services) => {
      if (!mounted || !services) return;
      unsubscribe = services.authApi.onAuthStateChanged(services.auth, async (user) => {
        if (!mounted) return;
        setLoading(true);

        if (!user) {
          setEmail(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        try {
          const nextProfile = await loadProfile(user, services);
          if (!mounted) return;
          setEmail(user.email);
          setProfile(nextProfile);
          setNotice(null);
        } catch (error) {
          await services.authApi.signOut(services.auth);
          if (!mounted) return;
          setEmail(null);
          setProfile(null);
          setNotice({
            kind: "error",
            message: error instanceof Error && error.message === "not-invited"
              ? "This account is not on the active invite roster. Contact a Faculty Director."
              : authErrorMessage(error),
          });
        } finally {
          if (mounted) setLoading(false);
        }
      });
    }).catch((error) => {
      if (!mounted) return;
      setLoading(false);
      setNotice({ kind: "error", message: authErrorMessage(error) });
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (nextEmail: string, password: string) => {
    const services = await getFirebaseServices();
    if (!services) return;
    setBusy(true);
    setNotice(null);
    try {
      await services.authApi.signInWithEmailAndPassword(services.auth, nextEmail.trim(), password);
    } catch (error) {
      setNotice({ kind: "error", message: authErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }, []);

  const requestPasswordReset = useCallback(async (nextEmail: string) => {
    const services = await getFirebaseServices();
    if (!services) return;
    const normalized = nextEmail.trim();
    if (!normalized) {
      setNotice({ kind: "error", message: "Enter your invited email address first." });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      await services.authApi.sendPasswordResetEmail(services.auth, normalized);
      setNotice({
        kind: "success",
        message: "If that address has an active invitation, Firebase will send password setup instructions.",
      });
    } catch (error) {
      const code = (error as FirebaseError | undefined)?.code;
      setNotice(code === "auth/invalid-email"
        ? { kind: "error", message: "Enter a valid email address." }
        : {
            kind: "success",
            message: "If that address has an active invitation, Firebase will send password setup instructions.",
          });
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    const services = await getFirebaseServices();
    if (!services) return;
    setBusy(true);
    try {
      await services.authApi.signOut(services.auth);
      setNotice({ kind: "success", message: "You are signed out." });
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    configured: firebaseConfigured,
    loading,
    busy,
    email,
    profile,
    notice,
    signIn,
    requestPasswordReset,
    signOut,
    clearNotice: () => setNotice(null),
  };
}
