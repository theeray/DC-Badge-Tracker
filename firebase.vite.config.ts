import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => ({
  plugins: [react()],
  server: {
    allowedHosts: ["terminal.local"],
    ...(command === "serve" && loadEnv(mode, process.cwd(), "VITE_").VITE_USE_FIREBASE_EMULATORS === "true" ? {
      proxy: {
        "/identitytoolkit.googleapis.com": { target: "http://127.0.0.1:9098" },
        "/securetoken.googleapis.com": { target: "http://127.0.0.1:9098" },
        "/google.firestore.v1.Firestore": { target: "http://127.0.0.1:8085" },
      },
    } : {}),
  },
  publicDir: "public",
  build: {
    outDir: "firebase-dist",
    emptyOutDir: true,
  },
}));
