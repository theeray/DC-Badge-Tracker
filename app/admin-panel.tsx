"use client";

import { useEffect, useMemo, useState } from "react";
import {
  clearMenteeProgress,
  readableFirebaseError,
  saveApprovedUser,
  updateActivatedUser,
  watchAllUsers,
  watchApprovedUsers,
  type AppRole,
  type ApprovedUser,
  type UserProfile,
} from "./firebase";

const emptyApproval: ApprovedUser = {
  displayName: "",
  email: "",
  role: "mentee",
  active: true,
};

export default function AdminPanel({
  currentDirector,
}: {
  currentDirector: UserProfile;
}) {
  const [approvals, setApprovals] = useState<ApprovedUser[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [draft, setDraft] = useState<ApprovedUser>(emptyApproval);
  const [message, setMessage] = useState("");
  const [busyEmail, setBusyEmail] = useState("");

  useEffect(() => {
    const stopApprovals = watchApprovedUsers(setApprovals, setMessage);
    const stopProfiles = watchAllUsers(setProfiles, setMessage);
    return () => {
      stopApprovals();
      stopProfiles();
    };
  }, []);

  const profilesByEmail = useMemo(
    () => new Map(profiles.map((profile) => [profile.email, profile])),
    [profiles],
  );

  const addApproval = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusyEmail(draft.email);
    setMessage("");
    try {
      await saveApprovedUser(draft);
      setDraft(emptyApproval);
      setMessage("Approved roster updated.");
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusyEmail("");
    }
  };

  const updateMember = async (
    approval: ApprovedUser,
    updates: Pick<ApprovedUser, "role" | "active">,
  ) => {
    setBusyEmail(approval.email);
    setMessage("");
    try {
      const next = { ...approval, ...updates };
      const profile = profilesByEmail.get(approval.email);
      if (profile) {
        await updateActivatedUser(profile, updates);
      } else {
        await saveApprovedUser(next);
      }
      setMessage(`${approval.displayName}'s access was updated.`);
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusyEmail("");
    }
  };

  const clearProgress = async (profile: UserProfile) => {
    if (!window.confirm(`Clear all saved progress for ${profile.displayName}?`)) {
      return;
    }
    setBusyEmail(profile.email);
    setMessage("");
    try {
      await clearMenteeProgress(profile.uid);
      setMessage(`${profile.displayName}'s progress was cleared.`);
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusyEmail("");
    }
  };

  return (
    <>
      <section className="track-heading admin-heading">
        <div>
          <span className="eyebrow">Faculty director controls</span>
          <h1>Accounts & records</h1>
          <p>
            Approve institutional emails, assign roles, pause access, and manage
            mentee records. Members create and reset their own passwords.
          </p>
        </div>
        <div className="project-count">
          <strong>{profiles.length}</strong>
          <span>activated<br />accounts</span>
        </div>
      </section>

      <section className="admin-grid">
        <article className="admin-invite-card">
          <span className="eyebrow">Add approved member</span>
          <h2>Approve an institutional email</h2>
          <form onSubmit={addApproval}>
            <label>
              <span>Name</span>
              <input
                type="text"
                value={draft.displayName}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    displayName: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label>
              <span>Institutional email</span>
              <input
                type="email"
                value={draft.email}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    email: event.target.value.toLowerCase(),
                  }))
                }
                required
              />
            </label>
            <label>
              <span>Role</span>
              <select
                value={draft.role}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    role: event.target.value as AppRole,
                  }))
                }
              >
                <option value="mentee">Mentee</option>
                <option value="mentor">Mentor</option>
                <option value="director">Faculty director</option>
              </select>
            </label>
            <button type="submit" disabled={Boolean(busyEmail)}>
              Add to approved roster
            </button>
          </form>
          <p>
            Approval does not send a password. The member uses “Create
            password,” verifies the institutional email, and activates the
            matching role automatically.
          </p>
        </article>

        <article className="admin-summary-card">
          <span className="eyebrow">Roster status</span>
          <div>
            <strong>{approvals.length}</strong>
            <span>approved emails</span>
          </div>
          <div>
            <strong>{approvals.length - profiles.length}</strong>
            <span>awaiting activation</span>
          </div>
          <div>
            <strong>{approvals.filter((item) => item.active).length}</strong>
            <span>active approvals</span>
          </div>
        </article>
      </section>

      {message ? <p className="admin-message" role="status">{message}</p> : null}

      <section className="admin-roster">
        <div className="section-title">
          <div>
            <span className="eyebrow">Approved roster</span>
            <h2>Member access</h2>
          </div>
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Account</th>
                <th>Role</th>
                <th>Access</th>
                <th>Records</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((approval) => {
                const profile = profilesByEmail.get(approval.email);
                const busy = busyEmail === approval.email;
                const isCurrentDirector = profile?.uid === currentDirector.uid;
                return (
                  <tr key={approval.email}>
                    <td>
                      <strong>{approval.displayName}</strong>
                      <span>{approval.email}</span>
                    </td>
                    <td>
                      <span className={profile ? "account-live" : "account-pending"}>
                        {profile ? "Activated" : "Awaiting member"}
                      </span>
                    </td>
                    <td>
                      <select
                        aria-label={`Role for ${approval.displayName}`}
                        value={approval.role}
                        disabled={busy || isCurrentDirector}
                        onChange={(event) =>
                          updateMember(approval, {
                            role: event.target.value as AppRole,
                            active: approval.active,
                          })
                        }
                      >
                        <option value="mentee">Mentee</option>
                        <option value="mentor">Mentor</option>
                        <option value="director">Faculty director</option>
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={approval.active ? "access-active" : "access-paused"}
                        disabled={busy || isCurrentDirector}
                        onClick={() =>
                          updateMember(approval, {
                            role: approval.role,
                            active: !approval.active,
                          })
                        }
                      >
                        {isCurrentDirector ? "Your access" : approval.active ? "Active" : "Paused"}
                      </button>
                    </td>
                    <td>
                      {profile?.role === "mentee" ? (
                        <button
                          type="button"
                          className="clear-progress"
                          disabled={busy}
                          onClick={() => clearProgress(profile)}
                        >
                          Clear progress
                        </button>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
