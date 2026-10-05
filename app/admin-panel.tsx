"use client";

import { useEffect, useMemo, useState } from "react";
import {
  readableFirebaseError,
  resetMenteeProgress,
  restoreMenteeProgress,
  saveApprovedUser,
  updateActivatedUser,
  watchAllUsers,
  watchApprovedUsers,
  watchProgressBackups,
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

const requestedMenteeApprovals: ApprovedUser[] = [
  {
    displayName: "Ethan Anderson",
    email: "ethan.anderson.3@live.bemidjistate.edu",
    role: "mentee",
    active: true,
  },
  {
    displayName: "Zachary Laskowski",
    email: "zachary.laskowski@live.bemidjistate.edu",
    role: "mentee",
    active: true,
  },
];

export default function AdminPanel({
  currentDirector,
}: {
  currentDirector: UserProfile;
}) {
  const [approvals, setApprovals] = useState<ApprovedUser[]>([]);
  const [approvalsLoaded, setApprovalsLoaded] = useState(false);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [draft, setDraft] = useState<ApprovedUser>(emptyApproval);
  const [message, setMessage] = useState("");
  const [busyEmail, setBusyEmail] = useState("");
  const [bulkRoster, setBulkRoster] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [progressBackups, setProgressBackups] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stopApprovals = watchApprovedUsers((users) => {
      setApprovals(users);
      setApprovalsLoaded(true);
    }, setMessage);
    const stopProfiles = watchAllUsers(setProfiles, setMessage);
    const stopBackups = watchProgressBackups(setProgressBackups, setMessage);
    return () => {
      stopApprovals();
      stopProfiles();
      stopBackups();
    };
  }, []);

  const profilesByEmail = useMemo(
    () => new Map(profiles.map((profile) => [profile.email, profile])),
    [profiles],
  );
  const missingRequestedMentees = useMemo(
    () =>
      approvalsLoaded ? requestedMenteeApprovals.filter(
        (member) =>
          !approvals.some((approval) => approval.email === member.email),
      ) : [],
    [approvals, approvalsLoaded],
  );

  const approveRequestedMentees = async () => {
    if (!missingRequestedMentees.length || bulkBusy) return;
    setBulkBusy(true);
    setMessage("");
    try {
      for (const member of missingRequestedMentees) {
        await saveApprovedUser(member);
      }
      setMessage(
        `${missingRequestedMentees.length} requested mentee account${missingRequestedMentees.length === 1 ? " was" : "s were"} added to the approved roster.`,
      );
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBulkBusy(false);
    }
  };

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

  const approveRoster = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = bulkRoster
      .split(/\r?\n/)
      .map((line) => {
        const [displayName = "", email = "", rawRole = "mentee"] = line
          .split(/[\t,]/)
          .map((value) => value.trim());
        const role: AppRole =
          rawRole.toLowerCase() === "mentor" ||
          rawRole.toLowerCase() === "director"
            ? (rawRole.toLowerCase() as AppRole)
            : "mentee";
        return { displayName, email: email.toLowerCase(), role, active: true };
      })
      .filter((item) => item.displayName && item.email.includes("@"));

    if (!parsed.length) {
      setMessage("Enter at least one line as Name, email, role.");
      return;
    }
    setBulkBusy(true);
    setMessage("");
    try {
      for (const member of parsed) {
        await saveApprovedUser(member);
      }
      setBulkRoster("");
      setMessage(`${parsed.length} approved member${parsed.length === 1 ? "" : "s"} added. They can now create their own passwords.`);
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBulkBusy(false);
    }
  };

  const resetProgress = async (profile: UserProfile) => {
    if (!window.confirm(`Reset all saved tutorial progress for ${profile.displayName}? A restorable backup will be created first.`)) {
      return;
    }
    setBusyEmail(profile.email);
    setMessage("");
    try {
      await resetMenteeProgress(profile.uid);
      setMessage(`${profile.displayName}'s tutorial progress was backed up and reset.`);
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusyEmail("");
    }
  };

  const restoreProgress = async (profile: UserProfile) => {
    setBusyEmail(profile.email);
    setMessage("");
    try {
      await restoreMenteeProgress(profile.uid);
      setMessage(`${profile.displayName}'s previous tutorial progress was restored.`);
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
            Approve member emails, assign roles, pause access, and manage
            mentee records. Every active mentor and faculty director can review
            every active mentee. Members create and reset their own passwords.
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
          <h2>Approve a member email</h2>
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
              <span>Approved email</span>
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
            password,” verifies the approved email, and activates the
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

      {missingRequestedMentees.length ? (
        <section className="admin-bulk-card requested-roster-card">
          <div>
            <span className="eyebrow">Requested roster additions</span>
            <h2>Approve missing mentees</h2>
            <p>
              {missingRequestedMentees.map((member) => member.displayName).join(" and ")}
              {missingRequestedMentees.length === 1 ? " is" : " are"} not yet on the approved roster.
              Existing accounts and roles will not be changed.
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={bulkBusy || Boolean(busyEmail)}
            onClick={() => void approveRequestedMentees()}
          >
            {bulkBusy ? "Adding…" : "Approve requested mentees"}
          </button>
        </section>
      ) : null}

      <section className="admin-bulk-card">
        <div>
          <span className="eyebrow">Onboard a group</span>
          <h2>Approve several members at once</h2>
          <p>
            Paste one person per line as <strong>Name, email, role</strong>.
            Role may be mentee, mentor, or director; omitted roles default to mentee.
          </p>
        </div>
        <form onSubmit={(event) => void approveRoster(event)}>
          <label>
            <span>Roster lines</span>
            <textarea
              value={bulkRoster}
              onChange={(event) => setBulkRoster(event.target.value)}
              placeholder={"Student Name, student@example.edu, mentee\nStudent Mentor, mentor@example.edu, mentor"}
              rows={5}
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={bulkBusy || Boolean(busyEmail)}>
            {bulkBusy ? "Adding roster…" : "Add approved roster"}
          </button>
        </form>
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
                          onClick={() =>
                            progressBackups.has(profile.uid)
                              ? restoreProgress(profile)
                              : resetProgress(profile)
                          }
                        >
                          {progressBackups.has(profile.uid)
                            ? "Restore tutorial progress"
                            : "Reset tutorial progress (reversible)"}
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
