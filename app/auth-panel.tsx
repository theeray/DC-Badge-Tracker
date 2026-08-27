"use client";

import { useState } from "react";
import {
  readableFirebaseError,
  registerWithInstitutionalEmail,
  requestPasswordReset,
  signInWithInstitutionalEmail,
} from "./firebase";

type AuthMode = "sign-in" | "register";

export default function AuthPanel({
  onBrowse,
  sessionError,
}: {
  onBrowse: () => void;
  sessionError?: string;
}) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(sessionError ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "register") {
        await registerWithInstitutionalEmail(email, password, displayName);
        setMode("sign-in");
        setPassword("");
        setMessage(
          "Verification sent. Open the message in your institutional inbox, verify the address, then return here to sign in.",
        );
      } else {
        await signInWithInstitutionalEmail(email, password);
      }
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      setMessage("Enter your institutional email first, then choose Reset password.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await requestPasswordReset(email);
      setMessage("Password reset email sent.");
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-identity">
        <img src="/brand/digital-corps-white.png" alt="Digital Corps" />
        <span className="eyebrow">Badge Tracker</span>
        <h1>Learn it. Practice it. Get endorsed.</h1>
        <p>
          Track tutorial progress, show mentors what you can do, and build a
          verified record of your Digital Corps skills.
        </p>
        <div className="auth-pill-row">
          <span>96 learning activities</span>
          <span>Real practice briefs</span>
          <span>Mentor endorsements</span>
        </div>
      </section>

      <section className="auth-card" aria-labelledby="auth-heading">
        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "sign-in"}
            className={mode === "sign-in" ? "active" : ""}
            onClick={() => {
              setMode("sign-in");
              setMessage("");
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setMessage("");
            }}
          >
            Create password
          </button>
        </div>

        <div className="auth-card-heading">
          <span className="eyebrow">
            {mode === "sign-in" ? "Welcome back" : "Approved members"}
          </span>
          <h2 id="auth-heading">
            {mode === "sign-in"
              ? "Sign in to your tracker"
              : "Activate your account"}
          </h2>
          <p>
            {mode === "sign-in"
              ? "Use the institutional email and password you created for this app."
              : "Use your approved institutional email and choose your own password. This does not use MinnState or Outlook sign-in."}
          </p>
        </div>

        <form onSubmit={submit}>
          {mode === "register" ? (
            <label>
              <span>Your name</span>
              <input
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </label>
          ) : null}
          <label>
            <span>Institutional email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {message ? <p className="auth-message" role="status">{message}</p> : null}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy
              ? "Working…"
              : mode === "sign-in"
                ? "Sign in"
                : "Create account & verify email"}
          </button>
        </form>

        <div className="auth-card-actions">
          {mode === "sign-in" ? (
            <button type="button" onClick={resetPassword} disabled={busy}>
              Reset password
            </button>
          ) : (
            <span>Only addresses approved by a faculty director can enter the tracker.</span>
          )}
          <button type="button" onClick={onBrowse}>Browse public resources</button>
        </div>
      </section>
    </main>
  );
}
