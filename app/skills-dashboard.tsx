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
  watchSkillCredentials,
  type AuthSession,
  type CredentialLevel,
  type Endorsement,
  type ProgressRecord,
  type SkillCredential,
  type UserProfile,
} from "./firebase";

type DisplayLevel = CredentialLevel | "Endorsed";

type CredentialRow = {
  key: string;
  worker: UserProfile;
  skill: Skill;
  level: DisplayLevel;
  endorsementCount: number;
  manual: SkillCredential | null;
};

type UndoAction = {
  message: string;
  run: () => Promise<void>;
};

const levelLabels: Record<DisplayLevel, string> = {
  Gold: "Can train others",
  Silver: "Can take requested work",
  Endorsed: "Mentor verified",
};

function areaName(skill: Skill) {
  return learningAreas.find((area) => area.id === skill.area)?.name ?? skill.area;
}

export default function SkillsDashboard({ session }: { session: AuthSession }) {
  const isDirector = session.profile.role === "director";
  const [workers, setWorkers] = useState<UserProfile[]>([]);
  const [progress, setProgress] = useState<Record<string, ProgressRecord>>({});
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
  const [manualCredentials, setManualCredentials] = useState<SkillCredential[]>([]);
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | DisplayLevel>("all");
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
    const stopCredentials = watchSkillCredentials(setManualCredentials, reportError);
    return () => {
      stopUsers();
      stopProgress();
      stopEndorsements();
      stopCredentials();
    };
  }, []);

  const rows = useMemo(() => {
    const manualByKey = new Map(
      manualCredentials.map((credential) => [
        `${credential.workerId}_${credential.skillId}`,
        credential,
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
        const endorsementCount = endorsementCounts.get(key) ?? 0;
        const status = progress[worker.uid]?.statuses[skill.id];
        const isAutomaticallyVerified =
          endorsementCount > 0 && (status === "ready" || status === "complete");
        if (!manual && !isAutomaticallyVerified) continue;
        nextRows.push({
          key,
          worker,
          skill,
          level: manual?.level ?? skill.tier ?? "Endorsed",
          endorsementCount,
          manual,
        });
      }
    }
    return nextRows.sort((a, b) => {
      const levelOrder = { Gold: 0, Silver: 1, Endorsed: 2 };
      return (
        levelOrder[a.level] - levelOrder[b.level] ||
        a.worker.displayName.localeCompare(b.worker.displayName) ||
        a.skill.title.localeCompare(b.skill.title)
      );
    });
  }, [endorsements, manualCredentials, progress, workers]);

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !normalized ||
        `${row.worker.displayName} ${row.skill.title} ${row.skill.group}`
          .toLowerCase()
          .includes(normalized);
      const matchesLevel = levelFilter === "all" || row.level === levelFilter;
      const matchesArea = areaFilter === "all" || row.skill.area === areaFilter;
      return matchesQuery && matchesLevel && matchesArea;
    });
  }, [areaFilter, levelFilter, query, rows]);

  const goldWorkers = new Set(
    rows.filter((row) => row.level === "Gold").map((row) => row.worker.uid),
  ).size;
  const silverWorkers = new Set(
    rows.filter((row) => row.level === "Silver").map((row) => row.worker.uid),
  ).size;

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
        message: existing ? "Skill status updated." : "Skill status assigned.",
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
        `${worker.displayName} is listed as ${draftLevel} for ${skill.title}.`,
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
    setDraftLevel(row.level === "Endorsed" ? "Silver" : row.level);
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
        message: "Director-assigned status removed.",
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
        `The director-assigned ${previous.level} status was removed from ${row.worker.displayName}.`,
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
      setMessage("The previous skill-status change was undone.");
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
            Gold identifies people who can train others. Silver identifies people
            ready to take requested work. Mentor-endorsed skills without a tier
            remain visible as verified experience.
          </p>
        </div>
        <div className="credential-key" aria-label="Credential key">
          <span className="credential-level level-gold"><strong>Gold</strong>Can train</span>
          <span className="credential-level level-silver"><strong>Silver</strong>Can do the work</span>
          <span className="credential-level level-endorsed"><strong>Endorsed</strong>Mentor verified</span>
        </div>
      </section>

      <section className="skills-summary-grid" aria-label="Team skills summary">
        <article><span>Gold-ready people</span><strong>{goldWorkers}</strong><small>available to train others</small></article>
        <article><span>Silver-ready people</span><strong>{silverWorkers}</strong><small>available for requested work</small></article>
        <article><span>Verified skills</span><strong>{rows.length}</strong><small>across active student workers</small></article>
      </section>

      {isDirector ? (
        <section className="credential-editor" id="credential-editor">
          <div>
            <span className="eyebrow">Faculty correction</span>
            <h2>Assign or correct a skill status</h2>
            <p>
              Use this for pre-existing experience or a Gold/Silver correction.
              Every change can be reversed.
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
              <span>Status</span>
              <select value={draftLevel} onChange={(event) => setDraftLevel(event.target.value as CredentialLevel)}>
                <option value="Silver">Silver · Can do the work</option>
                <option value="Gold">Gold · Can train others</option>
              </select>
            </label>
            <label className="credential-note">
              <span>Note (optional)</span>
              <input value={draftNote} onChange={(event) => setDraftNote(event.target.value)} maxLength={160} placeholder="Observed project or reason for correction" />
            </label>
            <button type="submit" className="primary-button" disabled={busy || !workers.length}>{busy ? "Saving…" : "Save skill status"}</button>
          </form>
        </section>
      ) : null}

      <section className="dashboard-section credentials-section">
        <div className="section-title">
          <div><span className="eyebrow">Searchable team roster</span><h2>Student skills</h2><p>Filter by person, capability, learning area, or skill.</p></div>
        </div>

        <div className="skills-filter-bar">
          <label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student or skill" aria-label="Search student or skill" /></label>
          <label><span>Level</span><select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value as "all" | DisplayLevel)}><option value="all">All levels</option><option value="Gold">Gold</option><option value="Silver">Silver</option><option value="Endorsed">Endorsed</option></select></label>
          <label><span>Area</span><select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}><option value="all">All learning areas</option>{learningAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        </div>

        {message ? <p className="time-message" role="status">{message}</p> : null}

        <div className="credentials-table-wrap">
          <table className="credentials-table">
            <thead><tr><th>Student worker</th><th>Skill</th><th>Area</th><th>Level</th><th>Evidence</th>{isDirector ? <th>Action</th> : null}</tr></thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.key}>
                  <td data-label="Student worker"><strong>{row.worker.displayName}</strong><small>{row.worker.role === "mentor" ? "Student mentor" : "Student mentee"}</small></td>
                  <td data-label="Skill"><strong>{row.skill.title}</strong><small>{row.skill.group}</small></td>
                  <td data-label="Area">{areaName(row.skill)}</td>
                  <td data-label="Level"><span className={`credential-level level-${row.level.toLowerCase()}`}><strong>{row.level}</strong>{levelLabels[row.level]}</span></td>
                  <td data-label="Evidence">{row.manual ? <><span className="source-pill">Director assigned</span>{row.manual.note ? <small>{row.manual.note}</small> : null}</> : <><span className="source-pill">Mentor endorsed</span><small>{row.endorsementCount} endorsement{row.endorsementCount === 1 ? "" : "s"}</small></>}</td>
                  {isDirector ? <td data-label="Action"><div className="credential-actions"><button type="button" onClick={() => editCredential(row)}>Edit</button>{row.manual ? <button type="button" className="remove-credential" onClick={() => void removeCredential(row)} disabled={busy}>Remove</button> : null}</div></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleRows.length ? <div className="empty-state"><strong>No matching verified skills yet</strong><p>Skills appear after a mentor endorsement or a faculty director’s Gold/Silver assignment.</p></div> : null}
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
