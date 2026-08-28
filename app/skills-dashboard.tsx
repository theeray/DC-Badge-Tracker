"use client";

import { useEffect, useMemo, useState } from "react";
import { allSkills, learningAreas, type Skill } from "./data";
import {
  readableFirebaseError,
  removeSkillCredential,
  saveSkillCredential,
  watchAllEndorsements,
  watchAllProgress,
  watchAllUsers,
  watchSelfReportedSkills,
  watchSkillCredentials,
  type AuthSession,
  type CredentialLevel,
  type Endorsement,
  type ProgressRecord,
  type SelfReportedSkill,
  type SkillCredential,
  type UserProfile,
} from "./firebase";

type VerifiedLevel = CredentialLevel | "Endorsed";
type LevelFilter = "all" | VerifiedLevel;

type CredentialRow = {
  key: string;
  worker: UserProfile;
  skill: Skill;
  reported: SelfReportedSkill | null;
  verifiedLevel: VerifiedLevel | null;
  endorsementCount: number;
  manual: SkillCredential | null;
};

type UndoAction = {
  message: string;
  run: () => Promise<void>;
};

const verifiedLevelLabels: Record<VerifiedLevel, string> = {
  Gold: "Can train others",
  Silver: "Can take requested work",
  Endorsed: "Demonstrated skill",
};

function areaName(skill: Skill) {
  return learningAreas.find((area) => area.id === skill.area)?.name ?? skill.area;
}

function rowRank(row: CredentialRow) {
  if (row.verifiedLevel === "Gold" || row.reported?.level === "Gold") return 0;
  if (row.verifiedLevel === "Silver" || row.reported?.level === "Silver") return 1;
  return 2;
}

export default function SkillsDashboard({ session }: { session: AuthSession }) {
  const isDirector = session.profile.role === "director";
  const [workers, setWorkers] = useState<UserProfile[]>([]);
  const [progress, setProgress] = useState<Record<string, ProgressRecord>>({});
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
  const [manualCredentials, setManualCredentials] = useState<SkillCredential[]>([]);
  const [selfReports, setSelfReports] = useState<SelfReportedSkill[]>([]);
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [draftWorkerId, setDraftWorkerId] = useState("");
  const [draftSkillId, setDraftSkillId] = useState(allSkills[0]?.id ?? "");
  const [draftLevel, setDraftLevel] = useState<CredentialLevel>("Silver");
  const [draftNote, setDraftNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);

  useEffect(() => {
    const reportError = (error: string) => setMessage(error);
    const stopUsers = watchAllUsers((users) => {
      const activeWorkers = users.filter(
        (user) => user.active && user.role !== "director",
      );
      setWorkers(activeWorkers);
      setDraftWorkerId((current) =>
        activeWorkers.some((worker) => worker.uid === current)
          ? current
          : (activeWorkers[0]?.uid ?? ""),
      );
    }, reportError);
    const stopProgress = watchAllProgress(setProgress, reportError);
    const stopEndorsements = watchAllEndorsements(setEndorsements, reportError);
    const stopCredentials = watchSkillCredentials(
      setManualCredentials,
      reportError,
    );
    const stopReports = watchSelfReportedSkills(
      session.profile,
      setSelfReports,
      reportError,
    );
    return () => {
      stopUsers();
      stopProgress();
      stopEndorsements();
      stopCredentials();
      stopReports();
    };
  }, [session.profile]);

  const rows = useMemo(() => {
    const manualByKey = new Map(
      manualCredentials.map((credential) => [
        `${credential.workerId}_${credential.skillId}`,
        credential,
      ]),
    );
    const reportsByKey = new Map(
      selfReports.map((report) => [
        `${report.memberId}_${report.skillId}`,
        report,
      ]),
    );
    const endorsementCounts = new Map<string, number>();
    for (const endorsement of endorsements) {
      const key = `${endorsement.menteeId}_${endorsement.skillId}`;
      endorsementCounts.set(key, (endorsementCounts.get(key) ?? 0) + 1);
    }

    const nextRows: CredentialRow[] = [];
    for (const worker of workers) {
      for (const skill of allSkills) {
        const key = `${worker.uid}_${skill.id}`;
        const manual = manualByKey.get(key) ?? null;
        const reported = reportsByKey.get(key) ?? null;
        const endorsementCount = endorsementCounts.get(key) ?? 0;
        const status = progress[worker.uid]?.statuses[skill.id];
        const isMentorVerified =
          endorsementCount > 0 && (status === "ready" || status === "complete");
        const verifiedLevel: VerifiedLevel | null = manual
          ? manual.level
          : isMentorVerified
            ? (skill.tier ?? "Endorsed")
            : null;
        if (!reported && !verifiedLevel) continue;
        nextRows.push({
          key,
          worker,
          skill,
          reported,
          verifiedLevel,
          endorsementCount,
          manual,
        });
      }
    }
    return nextRows.sort(
      (a, b) =>
        rowRank(a) - rowRank(b) ||
        a.worker.displayName.localeCompare(b.worker.displayName) ||
        a.skill.title.localeCompare(b.skill.title),
    );
  }, [endorsements, manualCredentials, progress, selfReports, workers]);

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !normalized ||
        `${row.worker.displayName} ${row.skill.title} ${row.skill.group} ${row.reported?.evidence ?? ""} ${row.manual?.note ?? ""}`
          .toLowerCase()
          .includes(normalized);
      const matchesLevel =
        levelFilter === "all" ||
        row.reported?.level === levelFilter ||
        row.verifiedLevel === levelFilter;
      const matchesArea = areaFilter === "all" || row.skill.area === areaFilter;
      return matchesQuery && matchesLevel && matchesArea;
    });
  }, [areaFilter, levelFilter, query, rows]);

  const verifiedGoldWorkers = new Set(
    rows
      .filter((row) => row.verifiedLevel === "Gold")
      .map((row) => row.worker.uid),
  ).size;
  const verifiedSilverWorkers = new Set(
    rows
      .filter((row) => row.verifiedLevel === "Silver")
      .map((row) => row.worker.uid),
  ).size;
  const unverifiedClaims = rows.filter(
    (row) => row.reported && !row.verifiedLevel,
  ).length;

  const saveCredential = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isDirector || busy) return;
    const worker = workers.find((item) => item.uid === draftWorkerId);
    const skill = allSkills.find((item) => item.id === draftSkillId);
    if (!worker || !skill) {
      setMessage("Choose a student worker and a skill.");
      return;
    }
    const existing = manualCredentials.find(
      (credential) =>
        credential.workerId === worker.uid && credential.skillId === skill.id,
    );
    setBusy(true);
    try {
      const id = await saveSkillCredential(
        worker,
        skill.id,
        draftLevel,
        draftNote,
        session.profile,
      );
      setUndoAction({
        message: existing ? "Faculty verification updated." : "Skill verified.",
        run: existing
          ? () =>
              saveSkillCredential(
                worker,
                skill.id,
                existing.level,
                existing.note,
                session.profile,
              ).then(() => undefined)
          : () => removeSkillCredential(id),
      });
      setMessage(
        `${worker.displayName} is faculty verified as ${draftLevel} for ${skill.title}.`,
      );
      setDraftNote("");
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  const editCredential = (row: CredentialRow) => {
    setDraftWorkerId(row.worker.uid);
    setDraftSkillId(row.skill.id);
    setDraftLevel(
      row.manual?.level ??
        row.reported?.level ??
        (row.verifiedLevel === "Gold" || row.verifiedLevel === "Silver"
          ? row.verifiedLevel
          : "Silver"),
    );
    setDraftNote(row.manual?.note ?? "");
    document.getElementById("credential-editor")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const removeCredential = async (row: CredentialRow) => {
    if (!row.manual || busy) return;
    const previous = row.manual;
    setBusy(true);
    try {
      await removeSkillCredential(previous.id);
      setUndoAction({
        message: "Faculty verification removed.",
        run: () =>
          saveSkillCredential(
            row.worker,
            row.skill.id,
            previous.level,
            previous.note,
            session.profile,
          ).then(() => undefined),
      });
      setMessage(
        `The faculty-verified ${previous.level} status was removed from ${row.worker.displayName}.`,
      );
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
      setMessage("The previous verification change was undone.");
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="tool-hero skills-dashboard-hero">
        <div>
          <span className="eyebrow">Team capability directory</span>
          <h1>Who can do the work—and teach it?</h1>
          <p>
            Self-reported Silver and Gold claims appear in search immediately,
            but never look verified by default. Mentor endorsement and faculty
            verification are shown separately so staffing decisions have context.
          </p>
        </div>
        <div className="development-key" aria-label="Verification key">
          <span className="verification-pill verification-self"><strong>Self-reported</strong>Member claim</span>
          <span className="verification-pill verification-mentor"><strong>Mentor endorsed</strong>Observed in practice</span>
          <span className="verification-pill verification-faculty"><strong>Faculty verified</strong>Confirmed level</span>
        </div>
      </section>

      <section className="skills-summary-grid" aria-label="Team skills summary">
        <article><span>Verified Gold people</span><strong>{verifiedGoldWorkers}</strong><small>confirmed to train others</small></article>
        <article><span>Verified Silver people</span><strong>{verifiedSilverWorkers}</strong><small>confirmed for requested work</small></article>
        <article><span>Awaiting verification</span><strong>{unverifiedClaims}</strong><small>self-reported badge claims</small></article>
      </section>

      {isDirector ? (
        <section className="credential-editor" id="credential-editor">
          <div>
            <span className="eyebrow">Faculty verification</span>
            <h2>Verify or correct a skill status</h2>
            <p>
              Confirm Gold or Silver after reviewing the member’s evidence and
              demonstrated work. Every faculty change can be reversed.
            </p>
          </div>
          <form onSubmit={(event) => void saveCredential(event)}>
            <label>
              <span>Student worker</span>
              <select value={draftWorkerId} onChange={(event) => setDraftWorkerId(event.target.value)} required>
                {workers.map((worker) => <option key={worker.uid} value={worker.uid}>{worker.displayName}</option>)}
              </select>
            </label>
            <label>
              <span>Skill</span>
              <select value={draftSkillId} onChange={(event) => setDraftSkillId(event.target.value)} required>
                {learningAreas.map((area) => (
                  <optgroup label={area.name} key={area.id}>
                    {area.skills.map((skill) => <option value={skill.id} key={skill.id}>{skill.group} · {skill.title}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              <span>Verified level</span>
              <select value={draftLevel} onChange={(event) => setDraftLevel(event.target.value as CredentialLevel)}>
                <option value="Silver">Silver · Can do the work</option>
                <option value="Gold">Gold · Can train others</option>
              </select>
            </label>
            <label className="credential-note">
              <span>Verification note (optional)</span>
              <input value={draftNote} onChange={(event) => setDraftNote(event.target.value)} maxLength={160} placeholder="Observed project or evidence reviewed" />
            </label>
            <button type="submit" className="primary-button" disabled={busy || !workers.length}>{busy ? "Saving…" : "Save verification"}</button>
          </form>
        </section>
      ) : null}

      <section className="dashboard-section credentials-section">
        <div className="section-title">
          <div><span className="eyebrow">Searchable team roster</span><h2>Student skills</h2><p>Search both claims and verified skills; use the evidence labels before assigning work or training.</p></div>
        </div>

        <div className="skills-filter-bar">
          <label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student, skill, or evidence" aria-label="Search student, skill, or evidence" /></label>
          <label><span>Level</span><select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value as LevelFilter)}><option value="all">All levels</option><option value="Gold">Gold · reported or verified</option><option value="Silver">Silver · reported or verified</option><option value="Endorsed">Mentor endorsed</option></select></label>
          <label><span>Area</span><select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}><option value="all">All learning areas</option>{learningAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        </div>

        {message ? <p className="time-message" role="status">{message}</p> : null}

        <div className="credentials-table-wrap">
          <table className="credentials-table verification-table">
            <thead><tr><th>Student worker</th><th>Skill</th><th>Area</th><th>Self-report</th><th>Verification</th><th>Evidence</th>{isDirector ? <th>Action</th> : null}</tr></thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.key}>
                  <td data-label="Student worker"><strong>{row.worker.displayName}</strong><small>{row.worker.role === "mentor" ? "Student mentor" : "Student mentee"}</small></td>
                  <td data-label="Skill"><strong>{row.skill.title}</strong><small>{row.skill.group}</small></td>
                  <td data-label="Area">{areaName(row.skill)}</td>
                  <td data-label="Self-report">
                    {row.reported ? (
                      <span className={`credential-level level-${row.reported.level.toLowerCase()}`}><strong>{row.reported.level}</strong>Self-reported</span>
                    ) : <span className="evidence-none">No self-report</span>}
                  </td>
                  <td data-label="Verification">
                    {row.manual ? (
                      <span className="verification-pill verification-faculty"><strong>Faculty verified</strong>{row.manual.level}</span>
                    ) : row.verifiedLevel ? (
                      <span className="verification-pill verification-mentor"><strong>Mentor endorsed</strong>{row.verifiedLevel === "Endorsed" ? "Verified skill" : `${row.verifiedLevel} · ${verifiedLevelLabels[row.verifiedLevel]}`}</span>
                    ) : (
                      <span className="verification-pill verification-pending"><strong>Not yet verified</strong>Self-report only</span>
                    )}
                  </td>
                  <td data-label="Evidence">
                    {row.reported?.evidence ? <small><strong>Member:</strong> {row.reported.evidence}</small> : null}
                    {row.manual?.note ? <small><strong>Faculty:</strong> {row.manual.note}</small> : null}
                    {!row.manual && row.endorsementCount ? <small>{row.endorsementCount} mentor endorsement{row.endorsementCount === 1 ? "" : "s"}</small> : null}
                    {!row.reported?.evidence && !row.manual?.note && !row.endorsementCount ? <span className="evidence-none">No note supplied</span> : null}
                  </td>
                  {isDirector ? <td data-label="Action"><div className="credential-actions"><button type="button" onClick={() => editCredential(row)}>{row.manual ? "Edit" : "Verify"}</button>{row.manual ? <button type="button" className="remove-credential" onClick={() => void removeCredential(row)} disabled={busy}>Remove</button> : null}</div></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleRows.length ? <div className="empty-state"><strong>No matching skills or claims yet</strong><p>Rows appear after a member self-reports, a mentor endorses demonstrated work, or faculty verifies a level.</p></div> : null}
        </div>
      </section>

      {undoAction ? (
        <div className="undo-toast" role="status">
          <span>{undoAction.message}</span>
          <button type="button" onClick={() => void undoLastAction()} disabled={busy}>Undo</button>
          <button type="button" className="undo-dismiss" onClick={() => setUndoAction(null)} aria-label="Dismiss undo">×</button>
        </div>
      ) : null}
    </>
  );
}
