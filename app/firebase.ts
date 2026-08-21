import type { FirebaseApp } from "firebase/app";
import type * as FirebaseAuth from "firebase/auth";
import type * as FirebaseFirestore from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean);

export type FirebaseServices = {
  app: FirebaseApp;
  auth: FirebaseAuth.Auth;
  database: FirebaseFirestore.Firestore;
  authApi: typeof FirebaseAuth;
  firestoreApi: typeof FirebaseFirestore;
};

let servicesPromise: Promise<FirebaseServices | null> | null = null;

export function getFirebaseServices() {
  if (!firebaseConfigured) return Promise.resolve(null);
  if (servicesPromise) return servicesPromise;

  servicesPromise = Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/firestore"),
  ]).then(([appApi, authApi, firestoreApi]) => {
    const app = appApi.getApps().length
      ? appApi.getApp()
      : appApi.initializeApp(firebaseConfig);
    const auth = authApi.getAuth(app);
    void authApi.setPersistence(auth, authApi.browserLocalPersistence);

    return {
      app,
      auth,
      database: firestoreApi.getFirestore(app),
      authApi,
      firestoreApi,
    };
  });

  return servicesPromise;
}
