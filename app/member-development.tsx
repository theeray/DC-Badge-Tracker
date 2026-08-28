"use client";

import { useEffect, useMemo, useState } from "react";
import { allSkills, learningAreas, type Skill } from "./data";
import {
  readableFirebaseError,
  removeSelfReportedSkill,
  removeSkillAssignment,
  restoreSelfReportedSkill,
  restoreSkillAssignment,
  saveSelfReportedSkill,
  saveSkillAssignment,
  updateSkillAssignmentNote,
  updateSkillAssignmentStatus,
  watchAllUsers,
  watchEndorsements,
  watchMemberSkillCredentials,
  watchSelfReportedSkills,
  watchSkillAssignments,
  type AssignmentStatus,
  type AuthSession,
  type CredentialLevel,
  type Endorsement,
  type SelfReportedSkill,
  type SkillAssignment,
  type SkillCredential,
  type UserProfile,
} from "./firebase";

type UndoAction = {
  message: string;
  run: () => Promise<void>;
};

const assignmentStatusLabels: Record<AssignmentStatus, string> = {
  assigned: "Assigned",
  "in-progress": "In progress",
  ready: "Ready for review",
  complete: "Complete",
};

function skillAreaName(skill: Skill) {
  return learningAreas.find((area) => area.id === skill.area)?.name ?? skill.area;
}

function skillResourceLabel(skill: Skill) {
  if (skill.href) return "Open tutorial ↗";
  if (skill.internal) return "Open learning path →";
  return "Open skill →";
}

export default function MemberDevelopment({
  session,
  onOpenSkill,
}: {
  session: AuthSession;
  onOpenSkill: (areaId: string) => void;
}) {
  const profile = session.profile;
  const canAssign = profile.role === "mentor" || profile.role === "director";
  const canSelfReport = profile.role !== "director";
  const [workers, setWorkers] = useState<UserProfile[]>(
    canAssign ? [] : [profile],
  );
  const [assignments, setAssignments] = useState<SkillAssignment[]>([]);
  const [selfReports, setSelfReports] = useState<SelfReportedSkill[]>([]);
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
  const [credentials, setCredentials] = useState<SkillCredential[]>([]);
  const [assignmentFilter, setAssignmentFilter] = useState(
    canAssign ? "all" : profile.uid,
  );
  const [draftAssigneeId, setDraftAssigneeId] = useState("");
  const [draftAssignmentSkillId, setDraftAssignmentSkillId] = useState(
    allSkills[0]?.id ?? "",
  );
  const [draftAssignmentNote, setDraftAssignmentNote] = useState("");
  const [draftReportSkillId, setDraftReportSkillId] = useState(
    allSkills.find((skill) => skill.tier)?.id ?? allSkills[0]?.id ?? "",
  );
  const [draftReportLevel, setDraftReportLevel] =
    useState<CredentialLevel>("Silver");
  const [draftEvidence, setDraftEvidence] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);

  useEffect(() => {
    const reportError = (error: string) => setMessage(error);
    const stopUsers = canAssign
      ? watchAllUsers((users) => {
          const activeWorkers = users.filter(
            (user) => user.active && user.role !== "director",
          );
          setWorkers(activeWorkers);
          setDraftAssigneeId((current) =>
            activeWorkers.some((worker) => worker.uid === current)
              ? current
              : (activeWorkers[0]?.uid ?? ""),
          );
        }, reportError)
      : () => undefined;
    const stopAssignments = watchSkillAssignments(
      profile,
      setAssignments,
      reportError,
    );
    const stopReports = watchSelfReportedSkills(
      profile,
      setSelfReports,
      reportError,
    );
    const stopEndorsements = watchEndorsements(
      profile.uid,
      setEndorsements,
      reportError,
    );
    const stopCredentials = watchMemberSkillCredentials(
      profile.uid,
      setCredentials,
      reportError,
    );
    return () => {
      stopUsers();
      stopAssignments();
      stopReports();
      stopEndorsements();
      stopCredentials();
    };
  }, [canAssign, profile]);

  const visibleAssignments = useMemo(
    () =>
      assignments.filter(
        (assignment) =>
          assignmentFilter === "all" ||
          assignment.assigneeId === assignmentFilter,
      ),
    [assignmentFilter, assignments],
  );

  const ownReports = useMemo(
    () => selfReports.filter((report) => report.memberId === profile.uid),
    [profile.uid, selfReports],
  );

  const submitAssignment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canAssign || busy) return;
    const assignee = workers.find((worker) => worker.uid === draftAssigneeId);
    const skill = allSkills.find(
      (item) => item.id === draftAssignmentSkillId,
    );
    if (!assignee || !skill) {
      setMessage("Choose a member and a skill or tutorial.");
      return;
    }
    const existing = assignments.find(
      (assignment) =>
        assignment.assigneeId === assignee.uid &&
        assignment.skillId === skill.id,
    );
    if (
      existing &&
      profile.role === "mentor" &&
      existing.assignedBy !== profile.uid
    ) {
      setMessage(
        `${existing.assignedByName} already assigned this item. A faculty director can edit that assignment.`,
      );
      return;
    }

    setBusy(true);
    try {
      const id = await saveSkillAssignment(
        assignee,
        skill.id,
        draftAssignmentNote,
        profile,
      );
      setUndoAction({
        message: existing ? "Assignment note updated." : "Learning assigned.",
        run: existing
          ? () => updateSkillAssignmentNote(existing.id, existing.note)
          : () => removeSkillAssignment(id),
      });
      setMessage(
        `${skill.title} ${existing ? "was updated for" : "was assigned to"} ${assignee.displayName}.`,
      );
      setDraftAssignmentNote("");
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  const editAssignment = (assignment: SkillAssignment) => {
    setDraftAssigneeId(assignment.assigneeId);
    setDraftAssignmentSkillId(assignment.skillId);
    setDraftAssignmentNote(assignment.note);
    document.getElementById("assignment-editor")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const changeAssignmentStatus = async (
    assignment: SkillAssignment,
    status: AssignmentStatus,
  ) => {
    if (
      busy ||
      (profile.role !== "director" && assignment.assigneeId !== profile.uid)
    ) {
      return;
    }
    const previousStatus = assignment.status;
    setBusy(true);
    try {
      await updateSkillAssignmentStatus(assignment.id, status);
      setUndoAction({
        message: `Assignment marked ${assignmentStatusLabels[status].toLowerCase()}.`,
        run: () => updateSkillAssignmentStatus(assignment.id, previousStatus),
      });
      setMessage(
        `${assignment.assigneeName}'s assignment is now ${assignmentStatusLabels[status].toLowerCase()}.`,
      );
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  const deleteAssignment = async (assignment: SkillAssignment) => {
    const canDelete =
      profile.role === "director" || assignment.assignedBy === profile.uid;
    if (!canDelete || busy) return;
    setBusy(true);
    try {
      await removeSkillAssignment(assignment.id);
      setUndoAction({
        message: "Assignment removed.",
        run: () => restoreSkillAssignment(assignment),
      });
      setMessage(`The assignment for ${assignment.assigneeName} was removed.`);
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  const submitSelfReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSelfReport || busy) return;
    const skill = allSkills.find((item) => item.id === draftReportSkillId);
    if (!skill) {
      setMessage("Choose a skill to report.");
      return;
    }
    const existing = ownReports.find((report) => report.skillId === skill.id);
    setBusy(true);
    try {
      const id = await saveSelfReportedSkill(
        profile,
        skill.id,
        draftReportLevel,
        draftEvidence,
      );
      setUndoAction({
        message: existing ? "Self-report updated." : "Badge self-reported.",
        run: existing
          ? () =>
              saveSelfReportedSkill(
                profile,
                existing.skillId,
                existing.level,
                existing.evidence,
              ).then(() => undefined)
          : () => removeSelfReportedSkill(id),
      });
      setMessage(
        `${skill.title} is now self-reported as ${draftReportLevel}. It will remain clearly marked until verified.`,
      );
      setDraftEvidence("");
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  const editSelfReport = (report: SelfReportedSkill) => {
    setDraftReportSkillId(report.skillId);
    setDraftReportLevel(report.level);
    setDraftEvidence(report.evidence);
    document.getElementById("self-report-editor")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const deleteSelfReport = async (report: SelfReportedSkill) => {
    if (busy || report.memberId !== profile.uid) return;
    setBusy(true);
    try {
      await removeSelfReportedSkill(report.id);
      setUndoAction({
        message: "Self-reported badge removed.",
        run: () => restoreSelfReportedSkill(report),
      });
      setMessage("The self-reported badge was removed.");
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  const undoLastAction = async () => {
    if (!undoAction || busy) return;
    const action = undoAction;
    setBusy(true);
    try {
      await action.run();
      setUndoAction(null);
      setMessage("The previous change was undone.");
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="tool-hero development-hero">
        <div>
          <span className="eyebrow">Member development</span>
          <h1>Assign learning. Show growing skills.</h1>
          <p>
            Mentors and faculty directors can assign any tutorial or skill to an
            active student member. Student workers can self-report Silver or Gold
            experience without presenting it as verified.
          </p>
        </div>
        <div className="development-key" aria-label="Badge evidence key">
          <span className="verification-pill verification-self"><strong>Self-reported</strong>Member claim</span>
          <span className="verification-pill verification-mentor"><strong>Mentor endorsed</strong>Observed in practice</span>
          <span className="verification-pill verification-faculty"><strong>Faculty verified</strong>Confirmed level</span>
        </div>
      </section>

      {canAssign ? (
        <section className="credential-editor assignment-editor" id="assignment-editor">
          <div>
            <span className="eyebrow">Learning assignment</span>
            <h2>Assign a skill or tutorial</h2>
            <p>
              Assign an item to any active student mentor or mentee. Mentors can
              revise assignments they created; faculty directors can correct any
              assignment.
            </p>
          </div>
          <form onSubmit={(event) => void submitAssignment(event)}>
            <label>
              <span>Member</span>
              <select
                value={draftAssigneeId}
                onChange={(event) => setDraftAssigneeId(event.target.value)}
                required
              >
                {workers.map((worker) => (
                  <option value={worker.uid} key={worker.uid}>
                    {worker.displayName} · {worker.role === "mentor" ? "Mentor" : "Mentee"}
                  </option>
                ))}
              </select>
            </label>
            <label className="assignment-skill-field">
              <span>Skill or tutorial</span>
              <select
                value={draftAssignmentSkillId}
                onChange={(event) =>
                  setDraftAssignmentSkillId(event.target.value)
                }
                required
              >
                {learningAreas.map((area) => (
                  <optgroup label={area.name} key={area.id}>
                    {area.skills.map((skill) => (
                      <option value={skill.id} key={skill.id}>
                        {skill.group} · {skill.title}
                        {skill.href ? " · Tutorial" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="credential-note">
              <span>Instructions (optional)</span>
              <input
                value={draftAssignmentNote}
                onChange={(event) => setDraftAssignmentNote(event.target.value)}
                maxLength={160}
                placeholder="What to practice, deadline, or expected outcome"
              />
            </label>
            <button
              type="submit"
              className="primary-button"
              disabled={busy || !workers.length}
            >
              {busy ? "Saving…" : "Assign learning"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="dashboard-section assignments-section">
        <div className="section-title">
          <div>
            <span className="eyebrow">Assigned learning</span>
            <h2>{canAssign ? "Team assignments" : "Your assignments"}</h2>
            <p>
              Assignment status is separate from tutorial progress and can be
              changed without erasing the underlying progress record.
            </p>
          </div>
        </div>

        {canAssign ? (
          <div className="development-filter-bar">
            <label>
              <span>Show assignments for</span>
              <select
                value={assignmentFilter}
                onChange={(event) => setAssignmentFilter(event.target.value)}
              >
                <option value="all">All active student members</option>
                {workers.map((worker) => (
                  <option value={worker.uid} key={worker.uid}>
                    {worker.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {message ? <p className="time-message" role="status">{message}</p> : null}

        <div className="assignment-grid">
          {visibleAssignments.map((assignment) => {
            const skill = allSkills.find(
              (item) => item.id === assignment.skillId,
            );
            if (!skill) return null;
            const canChangeStatus =
              profile.role === "director" ||
              assignment.assigneeId === profile.uid;
            const canEdit =
              profile.role === "director" ||
              assignment.assignedBy === profile.uid;
            return (
              <article className="assignment-card" key={assignment.id}>
                <header>
                  <div>
                    <span className="eyebrow">{skillAreaName(skill)}</span>
                    <h3>{skill.title}</h3>
                    <p>{skill.group}</p>
                  </div>
                  <span className={`assignment-status status-${assignment.status}`}>
                    {assignmentStatusLabels[assignment.status]}
                  </span>
                </header>
                {canAssign ? (
                  <p className="assignment-person">
                    <strong>Assigned to:</strong> {assignment.assigneeName}
                  </p>
                ) : null}
                <p className="assignment-meta">
                  Assigned by {assignment.assignedByName}
                  {assignment.note ? ` · ${assignment.note}` : ""}
                </p>
                <footer>
                  {skill.href ? (
                    <a href={skill.href} target="_blank" rel="noreferrer">
                      {skillResourceLabel(skill)}
                    </a>
                  ) : (
                    <button type="button" onClick={() => onOpenSkill(skill.area)}>
                      {skillResourceLabel(skill)}
                    </button>
                  )}
                  {canChangeStatus ? (
                    <label className="assignment-status-control">
                      <span>Status</span>
                      <select
                        value={assignment.status}
                        onChange={(event) =>
                          void changeAssignmentStatus(
                            assignment,
                            event.target.value as AssignmentStatus,
                          )
                        }
                        disabled={busy}
                      >
                        {Object.entries(assignmentStatusLabels).map(
                          ([value, label]) => (
                            <option value={value} key={value}>{label}</option>
                          ),
                        )}
                      </select>
                    </label>
                  ) : null}
                  {canEdit ? (
                    <div className="assignment-actions">
                      <button type="button" onClick={() => editAssignment(assignment)}>
                        Edit note
                      </button>
                      <button
                        type="button"
                        className="remove-assignment"
                        onClick={() => void deleteAssignment(assignment)}
                        disabled={busy}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </footer>
              </article>
            );
          })}
          {!visibleAssignments.length ? (
            <div className="empty-state">
              <strong>No assignments here yet</strong>
              <p>
                {canAssign
                  ? "Use the assignment form to send a skill or tutorial to an active member."
                  : "A mentor or faculty director can assign your next learning item here."}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {canSelfReport ? (
        <section className="self-report-layout">
          <div className="self-report-editor" id="self-report-editor">
            <span className="eyebrow">Your experience</span>
            <h2>Self-report a Silver or Gold badge</h2>
            <p>
              Silver means you can do the work. Gold means you can train someone
              else. Your claim appears in Team Skills immediately as
              self-reported—not verified—until staff evidence is added.
            </p>
            <form onSubmit={(event) => void submitSelfReport(event)}>
              <label>
                <span>Skill</span>
                <select
                  value={draftReportSkillId}
                  onChange={(event) => setDraftReportSkillId(event.target.value)}
                >
                  {learningAreas.map((area) => (
                    <optgroup label={area.name} key={area.id}>
                      {area.skills.map((skill) => (
                        <option value={skill.id} key={skill.id}>
                          {skill.group} · {skill.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                <span>Self-reported level</span>
                <select
                  value={draftReportLevel}
                  onChange={(event) =>
                    setDraftReportLevel(event.target.value as CredentialLevel)
                  }
                >
                  <option value="Silver">Silver · I can do the work</option>
                  <option value="Gold">Gold · I can train others</option>
                </select>
              </label>
              <label className="self-report-evidence">
                <span>Evidence or context (optional)</span>
                <textarea
                  value={draftEvidence}
                  onChange={(event) => setDraftEvidence(event.target.value)}
                  maxLength={300}
                  placeholder="Project, class, job, or example that supports this claim"
                />
              </label>
              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? "Saving…" : "Save self-report"}
              </button>
            </form>
          </div>

          <div className="self-report-list">
            <div className="section-title">
              <div><span className="eyebrow">Your badge claims</span><h2>Reported skills</h2></div>
            </div>
            {ownReports.map((report) => {
              const skill = allSkills.find((item) => item.id === report.skillId);
              if (!skill) return null;
              const credential = credentials.find(
                (item) => item.skillId === report.skillId,
              );
              const endorsementCount = endorsements.filter(
                (item) => item.skillId === report.skillId,
              ).length;
              return (
                <article className="self-report-card" key={report.id}>
                  <header>
                    <div><strong>{skill.title}</strong><span>{skill.group}</span></div>
                    <span className={`credential-level level-${report.level.toLowerCase()}`}>
                      <strong>{report.level}</strong>Self-reported
                    </span>
                  </header>
                  {report.evidence ? <p>{report.evidence}</p> : null}
                  <div className="report-verification-row">
                    {credential ? (
                      <span className="verification-pill verification-faculty">
                        <strong>Faculty verified</strong>{credential.level}
                      </span>
                    ) : endorsementCount ? (
                      <span className="verification-pill verification-mentor">
                        <strong>Mentor endorsed</strong>{endorsementCount} endorsement{endorsementCount === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="verification-pill verification-pending">
                        <strong>Not yet verified</strong>Self-report only
                      </span>
                    )}
                  </div>
                  <footer>
                    <button type="button" onClick={() => editSelfReport(report)}>Edit</button>
                    <button
                      type="button"
                      className="remove-assignment"
                      onClick={() => void deleteSelfReport(report)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  </footer>
                </article>
              );
            })}
            {!ownReports.length ? (
              <div className="empty-state">
                <strong>No self-reported badges yet</strong>
                <p>Add Silver or Gold experience when you are ready to have it reviewed.</p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {undoAction ? (
        <div className="undo-toast" role="status">
          <span>{undoAction.message}</span>
          <button type="button" onClick={() => void undoLastAction()} disabled={busy}>
            Undo
          </button>
          <button
            type="button"
            className="undo-dismiss"
            onClick={() => setUndoAction(null)}
            aria-label="Dismiss undo"
          >
            ×
          </button>
        </div>
      ) : null}
    </>
  );
}
