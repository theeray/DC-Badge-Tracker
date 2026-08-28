"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createTimeEntry,
  deleteTimeEntry,
  readableFirebaseError,
  updateTimeEntry,
  watchAllUsers,
  watchTimeEntries,
  type AuthSession,
  type TimeEntry,
  type UserProfile,
} from "./firebase";

type UndoAction = {
  message: string;
  run: () => Promise<void>;
};

function toLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDuration(milliseconds: number) {
  const safe = Math.max(0, milliseconds);
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}

function durationFor(entry: TimeEntry, now: number) {
  return Math.max(
    0,
    (entry.endedAt?.getTime() ?? now) - entry.startedAt.getTime(),
  );
}

export default function TimeTracker({ session }: { session: AuthSession }) {
  const profile = session.profile;
  const isDirector = profile.role === "director";
  const isStudentWorker = profile.role === "mentee" || profile.role === "mentor";
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [workers, setWorkers] = useState<UserProfile[]>(
    isStudentWorker ? [profile] : [],
  );
  const [workerFilter, setWorkerFilter] = useState(
    isStudentWorker ? profile.uid : "all",
  );
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [draftWorkerId, setDraftWorkerId] = useState(profile.uid);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(
    () =>
      watchTimeEntries(
        profile,
        (nextEntries) => {
          setEntries(nextEntries);
          setMessage("");
        },
        setMessage,
      ),
    [profile],
  );

  useEffect(() => {
    if (!isDirector) {
      setWorkers([profile]);
      return;
    }
    return watchAllUsers(
      (users) => {
        const studentWorkers = users.filter(
          (user) => user.active && user.role !== "director",
        );
        setWorkers(studentWorkers);
        setDraftWorkerId((current) =>
          studentWorkers.some((user) => user.uid === current)
            ? current
            : (studentWorkers[0]?.uid ?? ""),
        );
      },
      setMessage,
    );
  }, [isDirector, profile]);

  const activeEntry = isStudentWorker
    ? entries.find(
        (entry) => entry.workerId === profile.uid && entry.endedAt === null,
      )
    : undefined;
  const filteredEntries = useMemo(
    () =>
      workerFilter === "all"
        ? entries
        : entries.filter((entry) => entry.workerId === workerFilter),
    [entries, workerFilter],
  );
  const weekStart = startOfWeek(new Date(now)).getTime();
  const todayStart = new Date(new Date(now).setHours(0, 0, 0, 0)).getTime();
  const weeklyMilliseconds = filteredEntries
    .filter((entry) => entry.startedAt.getTime() >= weekStart)
    .reduce((sum, entry) => sum + durationFor(entry, now), 0);
  const todayMilliseconds = filteredEntries
    .filter((entry) => entry.startedAt.getTime() >= todayStart)
    .reduce((sum, entry) => sum + durationFor(entry, now), 0);
  const activeCount = entries.filter((entry) => entry.endedAt === null).length;

  const beginNewEntry = () => {
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60_000);
    const defaultWorker =
      isStudentWorker
        ? profile.uid
        : workerFilter !== "all"
          ? workerFilter
          : (workers[0]?.uid ?? "");
    setEditingEntry(null);
    setDraftWorkerId(defaultWorker);
    setDraftStart(toLocalInput(start));
    setDraftEnd(toLocalInput(end));
    setDraftNote("");
    setShowEditor(true);
  };

  const beginEdit = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setDraftWorkerId(entry.workerId);
    setDraftStart(toLocalInput(entry.startedAt));
    setDraftEnd(entry.endedAt ? toLocalInput(entry.endedAt) : "");
    setDraftNote(entry.note);
    setShowEditor(true);
  };

  const clockIn = async () => {
    if (!isStudentWorker || activeEntry || busy) return;
    setBusy(true);
    try {
      const startedAt = new Date();
      const id = await createTimeEntry({
        workerId: profile.uid,
        workerName: profile.displayName,
        startedAt,
        endedAt: null,
        note: "",
      });
      setMessage(`Clocked in at ${formatDateTime(startedAt)}.`);
      setUndoAction({
        message: "Clock-in recorded.",
        run: () => deleteTimeEntry(id),
      });
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  const clockOut = async () => {
    if (!activeEntry || busy) return;
    const previous = activeEntry;
    setBusy(true);
    try {
      const endedAt = new Date();
      await updateTimeEntry(activeEntry.id, {
        startedAt: activeEntry.startedAt,
        endedAt,
        note: activeEntry.note,
      });
      setMessage(`Clocked out at ${formatDateTime(endedAt)}.`);
      setUndoAction({
        message: "Clock-out recorded.",
        run: () =>
          updateTimeEntry(previous.id, {
            startedAt: previous.startedAt,
            endedAt: null,
            note: previous.note,
          }),
      });
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  const saveEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const worker = workers.find((item) => item.uid === draftWorkerId);
    const startedAt = new Date(draftStart);
    const endedAt = draftEnd ? new Date(draftEnd) : null;
    if (!worker || Number.isNaN(startedAt.getTime())) {
      setMessage("Choose a worker and enter a valid start time.");
      return;
    }
    if (!editingEntry && !endedAt) {
      setMessage("A manually added entry needs both a start and end time.");
      return;
    }
    if (endedAt && endedAt <= startedAt) {
      setMessage("The end time must be later than the start time.");
      return;
    }

    setBusy(true);
    try {
      if (editingEntry) {
        const previous = editingEntry;
        await updateTimeEntry(editingEntry.id, {
          startedAt,
          endedAt,
          note: draftNote,
        });
        setUndoAction({
          message: "Time entry updated.",
          run: () =>
            updateTimeEntry(previous.id, {
              startedAt: previous.startedAt,
              endedAt: previous.endedAt,
              note: previous.note,
            }),
        });
        setMessage("Time entry updated. You can undo this correction.");
      } else {
        const id = await createTimeEntry({
          workerId: worker.uid,
          workerName: worker.displayName,
          startedAt,
          endedAt,
          note: draftNote,
        });
        setUndoAction({
          message: "Manual time entry added.",
          run: () => deleteTimeEntry(id),
        });
        setMessage("Manual time entry added. You can undo this addition.");
      }
      setShowEditor(false);
      setEditingEntry(null);
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
      setMessage("The previous timekeeping action was undone.");
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  const removeEntry = async (entry: TimeEntry) => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteTimeEntry(entry.id);
      setUndoAction({
        message: "Time entry removed.",
        run: () =>
          createTimeEntry({
            workerId: entry.workerId,
            workerName: entry.workerName,
            startedAt: entry.startedAt,
            endedAt: entry.endedAt,
            note: entry.note,
          }).then(() => undefined),
      });
      setMessage("Time entry removed. You can undo this removal.");
    } catch (error) {
      setMessage(readableFirebaseError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="tool-hero time-hero">
        <div>
          <span className="eyebrow">Firebase timekeeping</span>
          <h1>{isDirector ? "Student hours dashboard" : "Your Digital Corps time clock"}</h1>
          <p>
            {isDirector
              ? "Review active shifts, weekly totals, and corrected entries for student mentors and mentees."
              : "Clock in when you begin work, clock out when you finish, and correct an entry if you forgot or left the timer running."}
          </p>
        </div>
        {isStudentWorker ? (
          <div className={`clock-card ${activeEntry ? "clock-running" : ""}`}>
            <span>{activeEntry ? "Currently on the clock" : "Currently off the clock"}</span>
            <strong>
              {activeEntry
                ? formatDuration(durationFor(activeEntry, now))
                : formatDuration(todayMilliseconds)}
            </strong>
            <small>{activeEntry ? `Started ${formatDateTime(activeEntry.startedAt)}` : "Today’s recorded time"}</small>
            <button
              type="button"
              className={activeEntry ? "clock-out-button" : "clock-in-button"}
              onClick={() => void (activeEntry ? clockOut() : clockIn())}
              disabled={busy}
            >
              {activeEntry ? "Clock out" : "Clock in"}
            </button>
          </div>
        ) : (
          <div className="clock-card director-clock-card">
            <span>Working now</span>
            <strong>{activeCount}</strong>
            <small>active student shift{activeCount === 1 ? "" : "s"}</small>
          </div>
        )}
      </section>

      <section className="time-summary-grid" aria-label="Time summary">
        <article><span>Today</span><strong>{formatDuration(todayMilliseconds)}</strong><small>hours recorded</small></article>
        <article><span>This week</span><strong>{formatDuration(weeklyMilliseconds)}</strong><small>Monday through now</small></article>
        <article><span>Entries</span><strong>{filteredEntries.length}</strong><small>visible records</small></article>
      </section>

      <section className="dashboard-section time-records-section">
        <div className="section-title">
          <div><span className="eyebrow">Editable records</span><h2>Time entries</h2><p>Corrections stay attached to the authenticated student account and save to Firebase.</p></div>
          <div className="time-toolbar">
            {isDirector ? (
              <label>
                <span>Worker</span>
                <select value={workerFilter} onChange={(event) => setWorkerFilter(event.target.value)}>
                  <option value="all">All student workers</option>
                  {workers.map((worker) => <option value={worker.uid} key={worker.uid}>{worker.displayName}</option>)}
                </select>
              </label>
            ) : null}
            <button type="button" className="primary-button" onClick={beginNewEntry} disabled={!workers.length}>Add missed time</button>
          </div>
        </div>

        {message ? <p className="time-message" role="status">{message}</p> : null}

        <div className="time-table-wrap">
          <table className="time-table">
            <thead><tr><th>Worker</th><th>Started</th><th>Ended</th><th>Duration</th><th>Note</th><th>Action</th></tr></thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr key={entry.id} className={entry.endedAt ? "" : "active-time-row"}>
                  <td data-label="Worker"><strong>{entry.workerName}</strong>{entry.endedAt ? null : <span className="live-pill">Live</span>}</td>
                  <td data-label="Started">{formatDateTime(entry.startedAt)}</td>
                  <td data-label="Ended">{entry.endedAt ? formatDateTime(entry.endedAt) : "On the clock"}</td>
                  <td data-label="Duration"><strong>{formatDuration(durationFor(entry, now))}</strong></td>
                  <td data-label="Note">{entry.note || "—"}</td>
                  <td data-label="Action"><div className="entry-actions"><button type="button" onClick={() => beginEdit(entry)}>Edit</button><button type="button" className="remove-entry" onClick={() => void removeEntry(entry)} disabled={busy}>Remove</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredEntries.length ? <div className="empty-state"><strong>No time entries yet</strong><p>Clock in or add a missed work period to create the first record.</p></div> : null}
        </div>
      </section>

      {showEditor ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowEditor(false)}>
          <form className="time-editor" onSubmit={(event) => void saveEntry(event)} onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span className="eyebrow">{editingEntry ? "Correct record" : "Add missed time"}</span><h2>{editingEntry ? "Edit time entry" : "Create a manual entry"}</h2></div><button type="button" className="close-button" onClick={() => setShowEditor(false)} aria-label="Close time editor">×</button></header>
            <label><span>Student worker</span><select value={draftWorkerId} onChange={(event) => setDraftWorkerId(event.target.value)} disabled={!isDirector || Boolean(editingEntry)}>{workers.map((worker) => <option value={worker.uid} key={worker.uid}>{worker.displayName}</option>)}</select></label>
            <div className="time-editor-grid">
              <label><span>Start</span><input type="datetime-local" required value={draftStart} onChange={(event) => setDraftStart(event.target.value)} /></label>
              <label><span>End</span><input type="datetime-local" value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)} /></label>
            </div>
            <label><span>Note (optional)</span><input type="text" maxLength={160} value={draftNote} onChange={(event) => setDraftNote(event.target.value)} placeholder="Project, event, or reason for correction" /></label>
            <p>{editingEntry && !draftEnd ? "Leaving the end blank keeps this shift active." : "Use this when the timer was started late, stopped late, or missed entirely."}</p>
            <footer><button type="button" className="secondary-button" onClick={() => setShowEditor(false)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save time entry"}</button></footer>
          </form>
        </div>
      ) : null}

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
