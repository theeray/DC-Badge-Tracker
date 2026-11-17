import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const emulatedChild = args[0] === "--emulated-child";
if (emulatedChild) args.shift();
const settings = loadEnv("development", root, "VITE_");

async function run(command, commandArgs) {
  // Local emulator control requests must stay on loopback instead of being
  // routed through an environment's outbound HTTP proxy. Remote traffic keeps
  // its existing proxy configuration.
  const localNoProxy = [process.env.NO_PROXY || process.env.no_proxy, "127.0.0.1", "localhost", "::1"].filter(Boolean).join(",");
  const child = spawn(command, commandArgs, { cwd: root, stdio: "inherit", env: { ...process.env, ...settings, NO_PROXY: localNoProxy, no_proxy: localNoProxy } });
  const stop = (signal) => { if (!child.killed) child.kill(signal); };
  const stopInterrupt = () => stop("SIGINT");
  const stopTerminate = () => stop("SIGTERM");
  process.once("SIGINT", stopInterrupt);
  process.once("SIGTERM", stopTerminate);
  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        process.exitCode = code ?? (signal ? 1 : 0);
        resolve();
      });
    });
  } finally {
    process.removeListener("SIGINT", stopInterrupt);
    process.removeListener("SIGTERM", stopTerminate);
    stop("SIGTERM");
  }
}

if (settings.VITE_USE_FIREBASE_EMULATORS !== "true") {
  await run(process.execPath, [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)), "--config", "firebase.vite.config.ts", ...args]);
} else if (emulatedChild) {
  await import("./seed-content-emulator.mjs");
  await run(process.execPath, [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)), "--config", "firebase.vite.config.ts", ...args]);
} else {
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const childCommand = [process.execPath, script, "--emulated-child", ...args].map(quote).join(" ");
  await run("npx", ["--yes", "firebase-tools@15.28.2", "emulators:exec", "--only", "auth,firestore", "--config", "firebase.emulator.json", "--project", "demo-dc-central-content", "--non-interactive", childCommand]);
}
