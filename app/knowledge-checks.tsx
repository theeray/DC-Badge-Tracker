"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { allSkills, learningAreas } from "./data";
import { readableFirebaseError, type AuthSession, type UserProfile } from "./firebase";
import {
  bankKey,
  getKnowledgeBankForSkill,
  knowledgeBanks,
  type KnowledgeBank,
  type QuestionId,
} from "./knowledge-catalog";
import {
  fetchKnowledgeGuide,
  installKnowledgeChecks,
  saveKnowledgeReview,
  submitKnowledgeAttempt,
  watchKnowledgeAttempts,
  watchKnowledgeReviews,
  watchPublishedBanks,
  watchReviewableMembers,
  type KnowledgeAttempt,
  type KnowledgeGuide,
  type KnowledgeReview,
  type KnowledgeReviewDraft,
} from "./knowledge-firebase";
import "./knowledge-checks.css";

const questionIds: QuestionId[] = ["q1", "q2", "q3", "q4"];
const emptyText = (): Record<QuestionId, string> => ({ q1: "", q2: "", q3: "", q4: "" });
const emptyVerdicts = (): Record<QuestionId, "" | "correct" | "incorrect"> => ({ q1: "", q2: "", q3: "", q4: "" });
const skillNames = new Map(allSkills.map((item) => [item.id, item.title]));

function dateLabel(date: Date | null) {
  return date ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Saving timestamp…";
}

function findBank(banks: KnowledgeBank[], key: string) {
  return banks.find((bank) => bankKey(bank) === key);
}

function RevisionResult({ review }: { review: KnowledgeReview }) {
  return (
    <article className={`kc-result ${review.status === "voided" ? "kc-result-voided" : ""}`}>
      <div className="kc-row"><strong>{review.status === "voided" ? "Review withdrawn" : `${review.score} of 4 correct`}</strong><span>{dateLabel(review.createdAt)}</span></div>
      <p>Reviewed by {review.reviewerName}</p>
      {review.status === "voided" ? <p>{review.reason}</p> : <>
        {review.summary ? <p className="kc-preserve">{review.summary}</p> : null}
        <ol className="kc-feedback-list">
          {questionIds.map((id, index) => <li key={id}>
            <strong>Question {index + 1}: {review.verdicts[id] === "correct" ? "Correct" : "Needs practice"}</strong>
            {review.feedback[id] ? <p className="kc-preserve">{review.feedback[id]}</p> : null}
            {review.practiceTasks[id] ? <p className="kc-preserve"><b>Try next:</b> {review.practiceTasks[id]}</p> : null}
          </li>)}
        </ol>
      </>}
    </article>
  );
}

function LearnerAttempt({ attempt, bank }: { attempt: KnowledgeAttempt; bank?: KnowledgeBank }) {
  const [reviews, setReviews] = useState<KnowledgeReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => watchKnowledgeReviews(attempt.ownerId, attempt.id, (items) => {
    setReviews(items); setLoading(false); setError("");
  }, (message) => { setError(message); setLoading(false); }), [attempt.ownerId, attempt.id]);
  return (
    <section className="kc-attempt-details" aria-label="Saved answers and feedback">
      <p className="kc-note">Submitted answers are kept unchanged. A retry creates a separate attempt. A corrected review creates a new revision.</p>
      <ol className="kc-answer-list">
        {questionIds.map((id, index) => <li key={id}>
          <strong>{bank?.questions.find((question) => question.id === id)?.prompt ?? `Question ${index + 1}`}</strong>
          <p className="kc-preserve">{attempt.answers[id]}</p>
        </li>)}
      </ol>
      {error ? <p className="kc-error" role="alert">{error}</p> : loading ? <p role="status">Loading feedback…</p> : reviews.length ? <>
        <h4>Latest review</h4><RevisionResult review={reviews[0]} />
        {reviews.length > 1 ? <details><summary>Earlier review revisions ({reviews.length - 1})</summary>{reviews.slice(1).map((review) => <RevisionResult key={review.id} review={review} />)}</details> : null}
      </> : <p className="kc-pending">Waiting for a mentor or faculty director to review. Your answers have been saved; no score has been assigned yet.</p>}
    </section>
  );
}

function TakeKnowledgeCheck({ profile, bank, skillId, onSubmitted }: {
  profile: UserProfile; bank: KnowledgeBank; skillId: string; onSubmitted: (id: string) => void;
}) {
  const [answers, setAnswers] = useState(emptyText);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (questionIds.some((id) => !answers[id].trim())) { setMessage("Answer all four questions before submitting."); return; }
    setBusy(true); setMessage("");
    try {
      const id = await submitKnowledgeAttempt(profile, bank, skillId, answers);
      setAnswers(emptyText());
      setMessage("Saved for mentor review. Your score and feedback will appear in your attempt history after review.");
      onSubmitted(id);
    } catch (error) { setMessage(readableFirebaseError(error)); }
    finally { setBusy(false); }
  }
  return <form className="kc-panel kc-take-form" onSubmit={submit}>
    <div className="kc-row"><span className="kc-kicker">Knowledge check · Version {bank.version}</span><span>4 short answers</span></div>
    <h3>{bank.title}</h3>
    <p>{bank.scope}</p>
    <a href={bank.sourceUrl} target="_blank" rel="noreferrer">Review the source lesson ↗</a>
    <p className="kc-note">Explain the process in your own words. Do not enter passwords, student IDs, banking details, actual payroll figures, or other private information. A knowledge check does not award a badge or authorize machine use.</p>
    {bank.questions.map((question, index) => <div className="kc-field" key={question.id}>
      <label htmlFor={`kc-answer-${question.id}`}><span>{index + 1}. {question.topic}</span><strong>{question.prompt}</strong></label>
      <textarea id={`kc-answer-${question.id}`} value={answers[question.id]} maxLength={2000} rows={4} required disabled={busy} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />
      <small>{answers[question.id].length}/2,000 characters</small>
    </div>)}
    <p className="kc-note">Your submission will be saved unchanged. You can take the check again as a new attempt. Correct answers are not displayed here.</p>
    <button className="kc-primary" type="submit" disabled={busy}>{busy ? "Saving submission…" : "Submit for mentor review"}</button>
    {message ? <p role="status" className="kc-message">{message}</p> : null}
  </form>;
}

function ReviewSubmission({ profile, attempt, bank }: { profile: UserProfile; attempt: KnowledgeAttempt; bank?: KnowledgeBank }) {
  const [guide, setGuide] = useState<KnowledgeGuide | null>(null);
  const [guideLoading, setGuideLoading] = useState(true);
  const [reviews, setReviews] = useState<KnowledgeReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [verdicts, setVerdicts] = useState(emptyVerdicts);
  const [feedback, setFeedback] = useState(emptyText);
  const [tasks, setTasks] = useState(emptyText);
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [draftDirty, setDraftDirty] = useState(false);
  const [draftBaseReviewId, setDraftBaseReviewId] = useState<string | null>(null);
  const latest = reviews[0];
  const draftConflict = draftDirty && (latest?.id ?? null) !== draftBaseReviewId;

  function loadLatestReview() {
    if (latest?.status === "graded") {
      setVerdicts(latest.verdicts); setFeedback(latest.feedback); setTasks(latest.practiceTasks); setSummary(latest.summary);
    } else { setVerdicts(emptyVerdicts()); setFeedback(emptyText()); setTasks(emptyText()); setSummary(""); }
    setReason(""); setDraftBaseReviewId(latest?.id ?? null); setDraftDirty(false);
  }

  useEffect(() => {
    let current = true;
    setGuideLoading(true); setGuide(null);
    void fetchKnowledgeGuide(attempt.bankKey).then((result) => {
      if (current) setGuide(result);
    }).catch((error) => { if (current) setMessage(readableFirebaseError(error)); })
      .finally(() => { if (current) setGuideLoading(false); });
    return () => { current = false; };
  }, [attempt.bankKey]);
  useEffect(() => watchKnowledgeReviews(attempt.ownerId, attempt.id, (items) => {
    setReviews(items); setReviewsLoading(false); setReviewError("");
  }, (error) => { setReviewError(error); setReviewsLoading(false); }), [attempt.ownerId, attempt.id]);
  useEffect(() => {
    // Realtime corrections must not silently replace unsaved mentor notes.
    if (!reviewsLoading && !draftDirty) loadLatestReview();
  }, [latest?.id, reviewsLoading, draftDirty]);

  function mark(id: QuestionId, value: "" | "correct" | "incorrect") {
    setDraftDirty(true);
    setVerdicts((current) => ({ ...current, [id]: value }));
    if (value === "incorrect" && guide) {
      setFeedback((current) => ({ ...current, [id]: current[id] || guide.questions[id].studentFeedback }));
      setTasks((current) => ({ ...current, [id]: current[id] || guide.questions[id].practiceTask }));
    } else if (guide) {
      setFeedback((current) => ({ ...current, [id]: current[id] === guide.questions[id].studentFeedback ? "" : current[id] }));
      setTasks((current) => ({ ...current, [id]: current[id] === guide.questions[id].practiceTask ? "" : current[id] }));
    }
  }
  async function save(status: "graded" | "voided") {
    if (busy || guideLoading || reviewsLoading || reviewError || !guide || !bank) return;
    if (status === "graded" && questionIds.some((id) => !verdicts[id])) { setMessage("Choose Correct or Needs practice for every question."); return; }
    if (status === "graded" && questionIds.some((id) => verdicts[id] === "incorrect" && (!feedback[id].trim() || !tasks[id].trim()))) { setMessage("Add feedback and a practice task for each question marked Needs practice."); return; }
    if (status === "voided" && !reason.trim()) { setMessage("Explain why this review is being withdrawn. The previous record will be retained."); return; }
    const draft: KnowledgeReviewDraft = {
      verdicts: status === "voided" ? { q1: "incorrect", q2: "incorrect", q3: "incorrect", q4: "incorrect" } : verdicts as Record<QuestionId, "correct" | "incorrect">,
      feedback: status === "voided" ? emptyText() : feedback,
      practiceTasks: status === "voided" ? emptyText() : tasks,
      summary: status === "voided" ? "" : summary,
      score: status === "voided" ? 0 : questionIds.filter((id) => verdicts[id] === "correct").length,
      status,
      reason: status === "voided" ? reason.trim() : "",
    };
    setBusy(true); setMessage("");
    try {
      await saveKnowledgeReview(profile, attempt.ownerId, attempt.id, draft, draftBaseReviewId);
      setDraftDirty(false);
      setMessage(status === "voided" ? "Review withdrawn. All previous revisions remain in the record. You can add a corrected review." : "Review saved. The learner can now see their score, feedback, and practice tasks—not the answer key.");
    } catch (error) { setMessage(readableFirebaseError(error)); }
    finally { setBusy(false); }
  }

  return <section className="kc-panel" aria-label="Mentor review">
    <span className="kc-kicker">Mentor review · {dateLabel(attempt.createdAt)}</span>
    <h3>{bank?.title ?? attempt.bankId}</h3>
    <p className="kc-note">Coach without giving away the answer. Ask the learner to revisit the relevant lesson, complete a small practice task, and explain their reasoning in a new attempt. Do not paste the private key into learner feedback.</p>
    {guideLoading || reviewsLoading ? <p role="status">Loading private grading guide and review history…</p> : null}
    {!guideLoading && !guide ? <p className="kc-error">The private grading guide is not installed. A faculty director must import it before this submission can be graded.</p> : null}
    {reviewError ? <p className="kc-error" role="alert">{reviewError}</p> : null}
    {draftConflict ? <div className="kc-pending" role="alert"><p>A newer review arrived. Your unsaved draft has been preserved. Read the new review below before replacing your draft.</p><button type="button" className="kc-secondary" onClick={loadLatestReview}>Load latest review and discard my unsaved draft</button></div> : null}
    {!bank ? <p className="kc-error">The saved version of this knowledge check is unavailable. Do not grade against a different version.</p> : null}
    {latest ? <details className="kc-review-history"><summary>Current review and earlier revisions ({reviews.length})</summary>{reviews.map((review) => <RevisionResult key={review.id} review={review} />)}</details> : null}
    <form onSubmit={(event) => { event.preventDefault(); void save("graded"); }}>
      {questionIds.map((id, index) => <fieldset key={id} className="kc-review-question" disabled={busy || !guide || !bank || reviewsLoading || Boolean(reviewError)}>
        <legend>{index + 1}. {bank?.questions.find((question) => question.id === id)?.topic ?? "Question"}</legend>
        <h4>{bank?.questions.find((question) => question.id === id)?.prompt}</h4>
        <div className="kc-submitted-answer"><b>Submitted answer</b><p className="kc-preserve">{attempt.answers[id]}</p></div>
        {guide ? <details className="kc-private-key"><summary>Private answer key and explanation</summary><p className="kc-preserve"><b>Expected answer:</b> {guide.questions[id].expectedAnswer}</p><p className="kc-preserve"><b>Why:</b> {guide.questions[id].explanation}</p><p className="kc-note">Reviewer-only guidance. This text is not included in the learner's result.</p></details> : null}
        <label htmlFor={`kc-verdict-${id}`}>Your assessment</label>
        <select id={`kc-verdict-${id}`} value={verdicts[id]} required onChange={(event) => mark(id, event.target.value as "" | "correct" | "incorrect")}><option value="">Choose an assessment</option><option value="correct">Correct</option><option value="incorrect">Needs practice (incorrect)</option></select>
        <label htmlFor={`kc-feedback-${id}`}>Feedback the learner will see</label>
        <textarea id={`kc-feedback-${id}`} value={feedback[id]} maxLength={1000} rows={3} required={verdicts[id] === "incorrect"} onChange={(event) => { setDraftDirty(true); setFeedback((current) => ({ ...current, [id]: event.target.value })); }} />
        <label htmlFor={`kc-task-${id}`}>Practice task the learner will see</label>
        <textarea id={`kc-task-${id}`} value={tasks[id]} maxLength={1500} rows={3} required={verdicts[id] === "incorrect"} onChange={(event) => { setDraftDirty(true); setTasks((current) => ({ ...current, [id]: event.target.value })); }} />
        {guide ? <button className="kc-text-button" type="button" disabled={verdicts[id] !== "incorrect"} onClick={() => { setDraftDirty(true); setFeedback((current) => ({ ...current, [id]: guide.questions[id].studentFeedback })); setTasks((current) => ({ ...current, [id]: guide.questions[id].practiceTask })); }}>Use suggested feedback and practice task</button> : null}
      </fieldset>)}
      <label className="kc-field" htmlFor="kc-review-summary"><strong>Overall feedback</strong><textarea id="kc-review-summary" maxLength={1500} rows={3} value={summary} disabled={busy} onChange={(event) => { setDraftDirty(true); setSummary(event.target.value); }} /></label>
      <p className="kc-note">Score: {questionIds.filter((id) => verdicts[id] === "correct").length}/4. Saving does not change tutorial status, Silver/Gold claims, or endorsements.</p>
      <button className="kc-primary" type="submit" disabled={busy || !guide || !bank || reviewsLoading || Boolean(reviewError)}>{busy ? "Saving…" : latest ? "Save corrected review as a new revision" : "Save review and feedback"}</button>
    </form>
    {profile.role === "director" && latest && latest.status !== "voided" ? <details className="kc-withdraw"><summary>Withdraw the current review</summary><p>Use this to correct a mistake without deleting history. A later corrected review can restore a valid assessment.</p><label htmlFor="kc-withdraw-reason">Reason</label><textarea id="kc-withdraw-reason" maxLength={500} rows={2} value={reason} onChange={(event) => { setDraftDirty(true); setReason(event.target.value); }} disabled={busy} /><button type="button" className="kc-secondary" disabled={busy || !reason.trim()} onClick={() => void save("voided")}>Withdraw review; keep history</button></details> : null}
    {message ? <p className="kc-message" role="status">{message}</p> : null}
  </section>;
}

function ReviewQueue({ profile, banks }: { profile: UserProfile; banks: KnowledgeBank[] }) {
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [attempts, setAttempts] = useState<KnowledgeAttempt[]>([]);
  const [attemptId, setAttemptId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => watchReviewableMembers(profile, (items) => {
    setMembers(items);
    setOwnerId((current) => items.some((member) => member.uid === current) ? current : items[0]?.uid ?? "");
  }, setMessage), [profile.uid, profile.role]);
  useEffect(() => {
    setAttempts([]); setAttemptId(""); setMessage("");
    if (!ownerId) return;
    setLoading(true);
    return watchKnowledgeAttempts(ownerId, (items) => {
      setAttempts(items); setLoading(false);
      setAttemptId((current) => items.some((attempt) => attempt.id === current) ? current : items[0]?.id ?? "");
    }, (error) => { setMessage(error); setLoading(false); }, profile.role);
  }, [ownerId, profile.role]);
  const attempt = attempts.find((item) => item.id === attemptId);
  return <>
    <section className="kc-panel">
      <h3>Review submissions</h3>
      <p>{profile.role === "mentor" ? "Review any active mentee's saved attempts. Mentor and faculty test attempts are private from this view." : "Review active members' attempts, including private faculty test attempts. Mentors cannot review their own submissions."}</p>
      <label className="kc-field" htmlFor="kc-review-member"><strong>Member</strong><select id="kc-review-member" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value="">Choose a member</option>{members.map((member) => <option key={member.uid} value={member.uid}>{member.displayName}{member.role === "director" ? " — private faculty test" : member.role === "mentor" ? " — mentor" : ""}</option>)}</select></label>
      {loading ? <p role="status">Loading submissions…</p> : ownerId && !attempts.length ? <p className="kc-pending">No saved attempts for this member yet.</p> : null}
      {attempts.length ? <label className="kc-field" htmlFor="kc-review-attempt"><strong>Submission (newest first)</strong><select id="kc-review-attempt" value={attemptId} onChange={(event) => setAttemptId(event.target.value)}>{attempts.map((item) => <option key={item.id} value={item.id}>{findBank(banks, item.bankKey)?.title ?? item.bankId} — {dateLabel(item.createdAt)}</option>)}</select></label> : null}
      {message ? <p className="kc-error" role="alert">{message}</p> : null}
    </section>
    {attempt ? <ReviewSubmission key={`${ownerId}-${attempt.id}`} profile={profile} attempt={attempt} bank={findBank(banks, attempt.bankKey)} /> : null}
  </>;
}

function SetupChecks({ profile }: { profile: UserProfile }) {
  const fileReadSequence = useRef(0);
  const [fileText, setFileText] = useState("");
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <section className="kc-panel">
    <span className="kc-kicker">Faculty director setup</span><h3>Install the private grading guides</h3>
    <p>Choose the supplied private knowledge-check setup JSON. This publishes the 30 shared question banks and stores their answer keys in protected Firestore documents. Answer keys are not part of the public website files or public GitHub source.</p>
    <p className="kc-note">Existing accounts, progress, endorsements, and time records are not changed. Existing knowledge-check versions and past attempts are retained. No billing upgrade or Cloud Functions are used.</p>
    <label className="kc-field" htmlFor="kc-setup-file"><strong>Private setup file (.json)</strong><input id="kc-setup-file" type="file" accept="application/json,.json" disabled={busy} onChange={(event) => {
      const sequence = ++fileReadSequence.current;
      const file = event.target.files?.[0]; setFileText(""); setFilename(""); setMessage("");
      if (!file) return;
      if (file.size > 1_000_000) { setMessage("Choose the supplied setup file, no larger than 1 MB."); return; }
      setFilename(file.name);
      void file.text().then((text) => { if (fileReadSequence.current === sequence) setFileText(text); }).catch(() => { if (fileReadSequence.current === sequence) setMessage("The file could not be read. Please choose it again."); });
    }} /></label>
    {filename ? <p>Selected: {filename}</p> : null}
    <button className="kc-primary" type="button" disabled={busy || !fileText} onClick={() => {
      setBusy(true); setMessage("");
      void installKnowledgeChecks(fileText, profile).then(() => {
        setMessage("Knowledge checks and private grading guides are installed. Members can submit checks, and mentors can review them."); setFileText("");
      }).catch((error) => setMessage(readableFirebaseError(error))).finally(() => setBusy(false));
    }}>{busy ? "Installing checks…" : "Install knowledge checks and private guides"}</button>
    {message ? <p className="kc-message" role="status">{message}</p> : null}
    <p className="kc-note">Keep this file private. Mentors have access to the keys when reviewing; they should take their own check before using its key if a blind assessment matters.</p>
  </section>;
}

export default function KnowledgeChecks({ session, initialSkillId, onOpenSkill }: { session: AuthSession; initialSkillId?: string; onOpenSkill?: (skillId: string) => void }) {
  const profile = session.profile;
  const reviewer = profile.role === "mentor" || profile.role === "director";
  const [tab, setTab] = useState<"mine" | "review" | "setup">("mine");
  const [published, setPublished] = useState<KnowledgeBank[]>([]);
  const [publishedLoading, setPublishedLoading] = useState(true);
  const [publishedError, setPublishedError] = useState("");
  const [attempts, setAttempts] = useState<KnowledgeAttempt[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(true);
  const [attemptsError, setAttemptsError] = useState("");
  const [selectedId, setSelectedId] = useState(() => getKnowledgeBankForSkill(initialSkillId ?? "")?.id ?? "");
  const [selectedSkillId, setSelectedSkillId] = useState(initialSkillId ?? "");
  const [expandedId, setExpandedId] = useState("");
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("all");
  const [formSequence, setFormSequence] = useState(0);
  useEffect(() => {
    setPublished([]); setPublishedLoading(true); setPublishedError("");
    return watchPublishedBanks((items) => { setPublished(items); setPublishedLoading(false); }, (error) => { setPublishedError(error); setPublishedLoading(false); });
  }, [profile.uid, profile.role]);
  useEffect(() => {
    setAttempts([]); setAttemptsLoading(true); setAttemptsError(""); setExpandedId("");
    return watchKnowledgeAttempts(profile.uid, (items) => { setAttempts(items); setAttemptsLoading(false); }, (error) => { setAttemptsError(error); setAttemptsLoading(false); });
  }, [profile.uid]);
  useEffect(() => {
    if (!initialSkillId) return;
    const bank = getKnowledgeBankForSkill(initialSkillId);
    if (bank) { setSelectedId(bank.id); setSelectedSkillId(initialSkillId); setTab("mine"); setSearch(""); setArea("all"); }
  }, [initialSkillId]);
  useEffect(() => { if (!reviewer) setTab("mine"); }, [reviewer]);
  const catalog = useMemo(() => knowledgeBanks.map((draft) => published.find((item) => item.id === draft.id && item.version === draft.version) ?? draft), [published]);
  const publishedKeys = useMemo(() => new Set(published.map(bankKey)), [published]);
  const visibleBanks = catalog.filter((bank) => {
    const related = allSkills.filter((skill) => bank.skillIds.includes(skill.id));
    return (area === "all" || related.some((skill) => skill.area === area)) && `${bank.title} ${related.map((skill) => skill.title).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  const selectedBank = catalog.find((bank) => bank.id === selectedId);
  const selectedPublished = selectedBank && publishedKeys.has(bankKey(selectedBank));
  const selectedSkill = selectedBank?.skillIds.includes(selectedSkillId) ? selectedSkillId : selectedBank?.skillIds[0] ?? "";
  const history = selectedBank ? attempts.filter((attempt) => attempt.bankId === selectedBank.id) : attempts;

  return <section className="knowledge-checks">
    <header className="kc-heading"><span className="kc-kicker">Learn · explain · practice</span><h2>Knowledge checks</h2><p>30 shared checks cover 44 tutorials. Explain what you learned, get mentor feedback, and build a record of your improvement.</p></header>
    <div className="kc-tabs" role="group" aria-label="Knowledge-check views">
      <button type="button" className={tab === "mine" ? "active" : ""} aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>My checks</button>
      {reviewer ? <button type="button" className={tab === "review" ? "active" : ""} aria-pressed={tab === "review"} onClick={() => setTab("review")}>Review submissions</button> : null}
      {profile.role === "director" ? <button type="button" className={tab === "setup" ? "active" : ""} aria-pressed={tab === "setup"} onClick={() => setTab("setup")}>Set up checks</button> : null}
    </div>
    {publishedError ? <p className="kc-error" role="alert">Knowledge checks could not load: {publishedError}</p> : null}
    {tab === "mine" ? <>
      <p className="kc-note">{profile.role === "director" ? "Your faculty test attempts are private from mentors and mentees. " : ""}Every attempt starts ungraded. Mentors assess answers manually; passing a check does not automatically award Silver, Gold, or an endorsement.</p>
      <div className="kc-filters"><label>Find a check<input type="search" value={search} placeholder="Search tutorial or skill" onChange={(event) => setSearch(event.target.value)} /></label><label>Learning path<select value={area} onChange={(event) => setArea(event.target.value)}><option value="all">All learning paths</option>{learningAreas.map((path) => <option value={path.id} key={path.id}>{path.name}</option>)}</select></label></div>
      {publishedLoading ? <p role="status">Checking which knowledge checks are installed…</p> : null}
      {!publishedLoading && !publishedError && !published.length ? <p className="kc-pending">Knowledge checks are awaiting setup. A faculty director can open Set up checks and import the supplied private guide file.</p> : null}
      {!selectedBank ? <div className="kc-bank-grid">{visibleBanks.map((bank) => <button type="button" key={bank.id} className={`kc-bank-card ${selectedId === bank.id ? "selected" : ""}`} aria-pressed={selectedId === bank.id} onClick={() => { setSelectedId(bank.id); setSelectedSkillId(bank.skillIds[0]); setExpandedId(""); setFormSequence((n) => n + 1); }}><span className="kc-kicker">4 questions · {bank.skillIds.length > 1 ? `${bank.skillIds.length} linked tutorials` : "1 tutorial"}</span><strong>{bank.title}</strong><span>{publishedKeys.has(bankKey(bank)) ? "Open knowledge check →" : "Preview topic · setup pending"}</span></button>)}</div> : <button type="button" className="kc-secondary" onClick={() => { setSelectedId(""); setExpandedId(""); }}>Choose a different knowledge check</button>}
      {!selectedBank && !visibleBanks.length ? <p className="kc-pending">No checks match these filters.</p> : null}
      {selectedBank ? <>
        <section className="kc-selection-summary"><h3>{selectedBank.title}</h3><p>Shared by: {selectedBank.skillIds.map((id) => skillNames.get(id) ?? id).join(" · ")}</p>{onOpenSkill ? <button className="kc-text-button" type="button" onClick={() => onOpenSkill(selectedSkill)}>Find the tutorial in Learn →</button> : null}</section>
        {selectedPublished && !publishedLoading && !publishedError ? <TakeKnowledgeCheck key={`${profile.uid}-${bankKey(selectedBank)}-${formSequence}`} profile={profile} bank={selectedBank} skillId={selectedSkill} onSubmitted={(id) => setExpandedId(id)} /> : <p className="kc-pending">This check cannot receive submissions until its saved question bank and private grading guide are installed.</p>}
      </> : null}
      <section className="kc-panel kc-history"><div className="kc-row"><h3>{selectedBank ? "Attempt history for this check" : "My attempt history"}</h3>{selectedBank ? <button className="kc-text-button" type="button" onClick={() => { setSelectedId(""); setExpandedId(""); }}>Show all checks</button> : null}</div><p>Original answers and all review revisions remain in your history. Open an attempt to see its feedback.</p>
        {attemptsError ? <p className="kc-error" role="alert">{attemptsError}</p> : attemptsLoading ? <p role="status">Loading saved attempts…</p> : !history.length ? <p className="kc-pending">No submitted attempts{selectedBank ? " for this check" : ""} yet.</p> : <ul className="kc-history-list">{history.map((attempt) => <li key={attempt.id}><button type="button" className="kc-history-toggle" aria-expanded={expandedId === attempt.id} onClick={() => setExpandedId((current) => current === attempt.id ? "" : attempt.id)}><span><strong>{findBank(published, attempt.bankKey)?.title ?? attempt.bankId}</strong><small>Version {attempt.version} · {dateLabel(attempt.createdAt)}</small></span><span>{expandedId === attempt.id ? "Close ↑" : "Answers & feedback ↓"}</span></button>{expandedId === attempt.id ? <LearnerAttempt key={attempt.id} attempt={attempt} bank={findBank(published, attempt.bankKey)} /> : null}</li>)}</ul>}
      </section>
    </> : null}
    {tab === "review" && reviewer ? <ReviewQueue key={profile.uid} profile={profile} banks={published} /> : null}
    {tab === "setup" && profile.role === "director" ? <SetupChecks profile={profile} /> : null}
  </section>;
}
