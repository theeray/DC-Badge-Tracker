// These switches are compiled out of production builds. No URL parameter or
// browser-stored value can redirect a production session to an emulator.
export const useFirebaseEmulators = import.meta.env.DEV
  && import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";

const requestedEmulatorRole = import.meta.env.VITE_EMULATOR_AUTO_SIGNIN;
export const emulatorAutoSignInRole = useFirebaseEmulators
  && (requestedEmulatorRole === "director" || requestedEmulatorRole === "mentee")
  ? requestedEmulatorRole : null;

export function emulatorBrowserConnection() {
  if (!useFirebaseEmulators || typeof window === "undefined") return null;
  if (!["127.0.0.1", "localhost", "terminal.local", "[::1]"].includes(window.location.hostname)) {
    throw new Error("The isolated demo emulators are available only through a local development preview.");
  }
  return {
    authUrl: window.location.origin,
    host: window.location.hostname,
    port: Number(window.location.port || (window.location.protocol === "https:" ? 443 : 80)),
  };
}
